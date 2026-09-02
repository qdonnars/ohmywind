#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Injecte la couche <monochrome> (icône thémée Android 13+) dans le projet
# Android généré par `bubblewrap update`. Bubblewrap 1.25.0 ne lit
# monochromeIconUrl que pour l'icône de notification, jamais pour le
# launcher : sans ce patch, l'icône reste non thémée sur Android 13+.
#
# À lancer depuis packages/android/ ou packages/android-dev/, entre
# `bubblewrap update` et `bubblewrap build` :
#
#   bubblewrap update --skipVersionUpgrade
#   ../android/patch-monochrome.sh   # ou ./patch-monochrome.sh côté prod
#   bubblewrap build
#
# Idempotent : relançable sans effet de bord. Échoue fort si le template
# Bubblewrap a changé de structure, pour ne jamais builder silencieusement
# sans la couche monochrome.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src_png="$script_dir/../web/public/icon-monochrome-512.png"
launcher_xml="app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
dest_png="app/src/main/res/mipmap-xxxhdpi/ic_monochrome.png"

[ -f "$src_png" ] || { echo "ERREUR: $src_png introuvable (asset web)"; exit 1; }
[ -f "$launcher_xml" ] || { echo "ERREUR: $launcher_xml introuvable. Lancer 'bubblewrap update' d'abord."; exit 1; }

cp "$src_png" "$dest_png"

if grep -q "<monochrome" "$launcher_xml"; then
  echo "Couche monochrome déjà présente dans $launcher_xml, rien à faire."
else
  grep -q "</adaptive-icon>" "$launcher_xml" || { echo "ERREUR: </adaptive-icon> introuvable, template Bubblewrap inattendu."; exit 1; }
  sed -i 's|</adaptive-icon>|    <monochrome android:drawable="@mipmap/ic_monochrome" />\n</adaptive-icon>|' "$launcher_xml"
  echo "Couche monochrome injectée dans $launcher_xml."
fi
