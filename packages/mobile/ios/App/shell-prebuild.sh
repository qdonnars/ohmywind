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
# 2. The app icon is a 1024 px PNG without alpha, as App Store Connect
#    demands.

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

# The app icon is versioned in the asset catalog: favicon.svg (the logo's
# vector source in packages/web/public) rendered full-bleed at 1024 px, see
# "Icône" in packages/mobile/README.md. iOS rounds the corners itself, and
# App Store Connect rejects an icon with an alpha channel or of another size.
icon="${SRCROOT}/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
if [ ! -f "$icon" ]; then
  echo "error: ${icon} is missing."
  exit 1
fi
dims=$(sips -g pixelWidth -g pixelHeight "$icon" | awk '/pixel(Width|Height):/ { printf "%s ", $2 }')
if [ "$dims" != "1024 1024 " ]; then
  echo "error: ${icon} is ${dims}px, not 1024 x 1024."
  exit 1
fi
if sips -g hasAlpha "$icon" | grep -q "hasAlpha: yes"; then
  echo "error: ${icon} has an alpha channel; the App Store refuses it."
  exit 1
fi
