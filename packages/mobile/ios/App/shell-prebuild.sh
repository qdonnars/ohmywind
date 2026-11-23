#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
#
# First build phase of the App target (Xcode "Run Script"), the iOS
# counterpart of the checks and generated resources in
# android/app/build.gradle.
#
# 1. The variant settings (variant.xcconfig, written by `cap sync ios`) must
#    describe the same app as the synced capacitor.config.json, so a build can
#    never carry the prod bundle id with the dev site, or the reverse.
# 2. The app icon is the PWA's own, read from packages/web/public at every
#    build so the two never drift apart.

set -eu

config="${SRCROOT}/App/capacitor.config.json"
if [ ! -f "$config" ]; then
  echo "error: ${config} is missing. Run \`OHMYWIND_VARIANT=dev npx cap sync ios\` (or prod, or local) in packages/mobile before building."
  exit 1
fi

synced_app_id=$(plutil -extract appId raw -o - "$config")
synced_url=$(plutil -extract server.url raw -o - "$config")
synced_host=$(printf '%s' "$synced_url" | sed -E 's#^[A-Za-z]+://([^/:]+).*$#\1#')

if [ "${OHMYWIND_APP_ID:-}" != "$synced_app_id" ] || [ "${OHMYWIND_APP_BOUND_DOMAIN:-}" != "$synced_host" ]; then
  echo "error: App/variant.xcconfig (${OHMYWIND_APP_ID:-missing}, ${OHMYWIND_APP_BOUND_DOMAIN:-missing}) does not match capacitor.config.json (${synced_app_id}, ${synced_host}). Re-run \`npx cap sync ios\` with the right OHMYWIND_VARIANT."
  exit 1
fi

# The maskable icon is full-bleed and has no alpha channel, which is what iOS
# wants: the system rounds the corners itself. The web package only has it at
# 512 px; the App Store asks for 1024.
icon_src="${SRCROOT}/../../../web/public/icon-maskable-512.png"
icon_dest="${SRCROOT}/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
if [ ! -f "$icon_src" ]; then
  echo "error: ${icon_src} is missing."
  exit 1
fi
if [ ! -f "$icon_dest" ] || [ "$icon_src" -nt "$icon_dest" ]; then
  sips -z 1024 1024 "$icon_src" --out "$icon_dest" >/dev/null
fi
# App Store Connect rejects an app icon with an alpha channel.
if sips -g hasAlpha "$icon_dest" | grep -q "hasAlpha: yes"; then
  echo "error: ${icon_dest} has an alpha channel; the App Store refuses it."
  exit 1
fi
