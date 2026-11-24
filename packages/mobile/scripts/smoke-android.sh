#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
#
# The Android smoke test in one command, on the workstation (WSL) as in CI:
# web build with the probe, APK of the `local` variant, emulator, then the
# scenario of smoke/run.sh (fallback page, first launch, second launch under
# the service worker, server stopped). See README.md, "Tests sur émulateur
# et simulateur".
#
#   packages/mobile/scripts/smoke-android.sh
#
# Environment (all optional):
#   WEB_DIST         a web build to use as is (CI passes the one built by the
#                    web job); otherwise packages/web is built here
#   OUT_DIR          screenshots, reports and logs (default: tmp/mobile-smoke/
#                    android at the repository root)
#   AVD              emulator started when no device is online (default ohmywind)
#   EMULATOR_BOOTING 1 when the caller has just started an emulator: wait for
#                    it instead of starting one
#
# Never starts or kills the adb server: under WSL it has to be started by hand
# (`adb -a -P 5037 nodaemon server`), see the README. The test uninstalls and
# reinstalls fr.ohmywind.app.dev on the device.

set -euo pipefail

mobile_dir=$(cd "$(dirname "$0")/.." && pwd)
repo_dir=$(cd "$mobile_dir/../.." && pwd)
out=${OUT_DIR:-$repo_dir/tmp/mobile-smoke/android}
mkdir -p "$out"

# Toolchain: the workstation's JDK 21 and Bubblewrap SDK when nothing else is set.
if [ -z "${JAVA_HOME:-}" ]; then
  jdk=$(ls -d "$HOME"/.jdks/jdk-21* 2>/dev/null | head -1 || true)
  if [ -n "$jdk" ]; then export JAVA_HOME="$jdk"; fi
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/.bubblewrap/android_sdk" ]; then
  export ANDROID_HOME="$HOME/.bubblewrap/android_sdk"
fi
: "${ANDROID_HOME:?ANDROID_HOME is not set}"
if [ -n "${JAVA_HOME:-}" ]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

if ! timeout 10 adb version >/dev/null 2>&1 || ! timeout 10 adb devices >/dev/null 2>&1; then
  echo "adb does not answer. Under WSL, start its server by hand first: adb -a -P 5037 nodaemon server" >&2
  exit 1
fi

online_device() { timeout 10 adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1; exit }'; }

started_emulator=""
if [ -z "$(online_device)" ] && [ "${EMULATOR_BOOTING:-0}" != 1 ]; then
  echo "[smoke-android] no device online, starting the AVD ${AVD:-ohmywind}"
  emulator -avd "${AVD:-ohmywind}" -no-window -no-audio -no-boot-anim -no-snapshot-save \
    -gpu swiftshader_indirect >"$out/emulator.log" 2>&1 &
  started_emulator=yes
fi

stop_emulator() {
  if [ -n "$started_emulator" ]; then timeout 30 adb emu kill >/dev/null 2>&1 || true; fi
}
trap stop_emulator EXIT

# 1. The web build, copied so the probe never lands in packages/web/dist.
dist=$out/web-dist
rm -rf "$dist"
if [ -n "${WEB_DIST:-}" ]; then
  cp -R "$WEB_DIST" "$dist"
else
  echo "[smoke-android] building packages/web"
  (cd "$repo_dir/packages/web" && npm run build)
  cp -R "$repo_dir/packages/web/dist" "$dist"
fi
node "$mobile_dir/smoke/inject-probe.mjs" "$dist/index.html" http://localhost:4174/report

# 2. The APK of the local variant, built while the emulator boots.
echo "[smoke-android] building the APK (local variant)"
(cd "$mobile_dir" && OHMYWIND_VARIANT=local npx cap sync android)
(cd "$mobile_dir/android" && ./gradlew assembleDebug --console=plain -q)
apk=$mobile_dir/android/app/build/outputs/apk/debug/ohmywind-local-debug.apk

# 3. A booted device.
echo "[smoke-android] waiting for the device"
for _ in $(seq 100); do
  if [ -n "$(online_device)" ] &&
    [ "$(timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then
    break
  fi
  sleep 3
done
[ "$(timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] || {
  echo "no booted device after 5 minutes" >&2
  exit 1
}
timeout 10 adb shell dumpsys package com.google.android.webview 2>/dev/null | grep -m1 versionName || true

# 4. The scenario. Under WSL a stopped server does not refuse connections,
# see SMOKE_REFUSE_WHEN_DOWN in smoke/run.sh.
if grep -qi microsoft /proc/version 2>/dev/null; then export SMOKE_REFUSE_WHEN_DOWN=1; fi
APK=$apk WEB_DIST=$dist OUT_DIR=$out "$mobile_dir/smoke/run.sh" android
echo "[smoke-android] screenshots and reports in $out"
