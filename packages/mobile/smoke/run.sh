#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
#
# Smoke scenario of the native shell, the same on both platforms. The app is
# the `local` variant (http://localhost:4173), served by serve.mjs from the
# web build, which carries the probe (inject-probe.mjs) reporting to
# collector.mjs on port 4174.
#
#   0-fallback   fresh install, site server down: the shell's offline
#                fallback page, and no report since the site never loaded
#   1-first      server up: native shell, site loaded, plugins answer, the
#                service worker installed and activated
#   2-second     relaunch: the page is controlled by the service worker
#   3-offline    server stopped, relaunch: the site still opens, served by
#                the service worker
#   4-plan       server up again, the probe opens /plan with a route: the
#                page fits the screen (not scrolled, header at the top) and
#                still does with the drawer at its highest setting
#
#   android: APK=<path> smoke/run.sh android   (emulator booted, adb on PATH)
#   ios:     APP_PATH=<App.app> UDID=<id> smoke/run.sh ios   (simulator booted)
#
# Screenshots, matched reports, all reports and the device logs land in
# OUT_DIR (default ./smoke-out). Exits non-zero at the first stage that fails.

set -euo pipefail

platform=${1:?usage: run.sh android|ios}
here=$(cd "$(dirname "$0")" && pwd)
dist_dir=${WEB_DIST:-$here/../../web/dist}
out=${OUT_DIR:-$PWD/smoke-out}
mkdir -p "$out"
out=$(cd "$out" && pwd)
reports=$out/reports.jsonl
app_id=fr.ohmywind.app.dev
site=http://localhost:4173

collector_pid=""
server_pid=""
log_pid=""

now_ms() { node -e 'console.log(Date.now())'; }
step() { echo; echo "=== $* ==="; }

case "$platform" in
  android)
    adb_() { timeout 60 adb "$@"; }
    prepare() {
      adb_ reverse tcp:4173 tcp:4173
      adb_ reverse tcp:4174 tcp:4174
      adb_ logcat -c || true
    }
    install_app() {
      adb_ uninstall "$app_id" >/dev/null 2>&1 || true
      adb_ install -r "${APK:?APK is not set}"
    }
    launch() { adb_ shell am start -W -n "$app_id/fr.ohmywind.app.MainActivity" >/dev/null; }
    stop_app() { adb_ shell am force-stop "$app_id" || true; }
    screenshot() { adb_ exec-out screencap -p >"$out/$1.png"; }
    # The fallback page is the shell's own, without the probe: read what the
    # WebView exposes to accessibility instead.
    fallback_evidence() {
      adb_ shell uiautomator dump /sdcard/ui.xml >/dev/null
      adb_ exec-out cat /sdcard/ui.xml >"$out/$1-ui.xml"
      grep -Eq 'Chargement impossible|Could not load|Laden nicht möglich|Caricamento non riuscito|Error de carga' "$out/$1-ui.xml"
    }
    collect_logs() { adb_ logcat -d >"$out/logcat.txt" 2>&1 || true; }
    ;;
  ios)
    sim() { xcrun simctl "$@"; }
    prepare() {
      # NSLog lines from the app (ShellViewController) and WebKit's own.
      xcrun simctl spawn "${UDID:?UDID is not set}" log stream --level debug --style compact \
        --predicate 'process == "App" OR subsystem == "com.apple.WebKit"' >"$out/device-log.txt" 2>&1 &
      log_pid=$!
    }
    install_app() {
      sim uninstall "$UDID" "$app_id" >/dev/null 2>&1 || true
      sim install "$UDID" "${APP_PATH:?APP_PATH is not set}"
    }
    launch() {
      sim launch --terminate-running-process --stdout="$out/$stage.stdout.txt" --stderr="$out/$stage.stderr.txt" \
        "$UDID" "$app_id" >/dev/null
    }
    stop_app() { sim terminate "$UDID" "$app_id" >/dev/null 2>&1 || true; }
    screenshot() { sim io "$UDID" screenshot "$out/$1.png" >/dev/null; }
    fallback_evidence() {
      grep -q "showing the offline fallback page" "$out/device-log.txt" "$out/$1".std*.txt
    }
    collect_logs() {
      if [ -n "$log_pid" ]; then kill "$log_pid" 2>/dev/null || true; fi
    }
    ;;
  *)
    echo "unknown platform: $platform" >&2
    exit 2
    ;;
esac

# Under WSL a port nobody listens on drops the connection instead of
# refusing it: the WebView then waits instead of failing, and adb itself can
# stall on the reversed port. SMOKE_REFUSE_WHEN_DOWN=1 keeps a listener on the
# port while the site is "down" that resets every connection, which is what
# a stopped server looks like on a normal machine.
refuser_pid=""

start_refuser() {
  if [ "${SMOKE_REFUSE_WHEN_DOWN:-0}" = 1 ] && [ -z "$refuser_pid" ]; then
    node "$here/serve.mjs" - 4173 --refuse >>"$out/serve.log" 2>&1 &
    refuser_pid=$!
    sleep 1
  fi
}

stop_refuser() {
  if [ -n "$refuser_pid" ]; then
    kill "$refuser_pid" 2>/dev/null || true
    wait "$refuser_pid" 2>/dev/null || true
    refuser_pid=""
  fi
}

start_server() {
  stop_refuser
  node "$here/serve.mjs" "$dist_dir" 4173 >>"$out/serve.log" 2>&1 &
  server_pid=$!
  for _ in $(seq 60); do
    if curl -sf --max-time 3 "$site/" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "the site server did not start" >&2
  return 1
}

stop_server() {
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
  server_pid=""
  start_refuser
  for _ in $(seq 20); do
    if ! curl -s --max-time 3 -o /dev/null "$site/"; then return 0; fi
    sleep 1
  done
  echo "the site server is still answering" >&2
  return 1
}

cleanup() {
  status=$?
  collect_logs
  if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi
  stop_refuser
  if [ -n "$collector_pid" ]; then kill "$collector_pid" 2>/dev/null || true; fi
  exit $status
}
trap cleanup EXIT

# Waits for a report matching the expectations, then screenshots the stage.
expect_stage() {
  local name=$1 since=$2 timeout=$3
  shift 3
  if node "$here/expect.mjs" "$reports" "$since" "$timeout" "$out/$name.json" "$@"; then
    sleep 3
    screenshot "$name"
  else
    screenshot "$name-failed" || true
    return 1
  fi
}

: >"$reports"
goto=$out/goto.json
rm -f "$goto"
node "$here/collector.mjs" 4174 "$reports" "$goto" >"$out/collector.log" 2>&1 &
collector_pid=$!

prepare
install_app
start_refuser

step "0-fallback: fresh install, server down"
stage=0-fallback
since=$(now_ms)
launch
shown=""
for _ in $(seq 30); do
  sleep 3
  if fallback_evidence "$stage" 2>/dev/null; then
    shown=yes
    break
  fi
done
sleep 2
screenshot "$stage"
if [ -z "$shown" ]; then
  echo "the offline fallback page did not show up" >&2
  exit 1
fi
echo "fallback page on screen"
# The site never loaded, so the probe must have stayed silent.
node "$here/expect.mjs" "$reports" "$since" 1 "$out/$stage.json" none
stop_app

start_server

step "1-first: server up"
stage=1-first
since=$(now_ms)
launch
expect_stage "$stage" "$since" 150 \
  native=true platform="$platform" appMounted=true appInfo.id="$app_id" \
  sw.registered=true sw.active=activated shellImport='~"none"'
stop_app

step "2-second: relaunch, controlled by the service worker"
stage=2-second
since=$(now_ms)
launch
expect_stage "$stage" "$since" 90 native=true appMounted=true sw.controlled=true
stop_app

stop_server
echo "site server stopped: $site no longer answers"

step "3-offline: server down, relaunch"
stage=3-offline
since=$(now_ms)
launch
expect_stage "$stage" "$since" 90 native=true appMounted=true sw.controlled=true appInfo.id="$app_id"
stop_app

start_server

step "4-plan: the planner fits the screen"
stage=4-plan
# Two waypoints off Marseille; the drawer height the user last dragged to is
# set to the maximum, which overflowed the column on an iPhone (2026-11).
printf '%s\n' '{"path":"/plan?wpts=43.28,5.35;43.00,6.20","storage":{"ow_drawer_vh_v1":"90"}}' >"$goto"
since=$(now_ms)
launch
expect_stage "$stage" "$since" 90 native=true appMounted=true href='~/plan?' \
  layout.shifted=false layout.columnOverflows=false layout.planStress.columnOverflows=false
rm -f "$goto"
stop_app

echo
echo "smoke: all stages passed on $platform"
