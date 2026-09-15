#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
#
# Rend le flyer en PDF (A5 seul, et A4 paysage avec deux exemplaires) et en
# aperçus PNG, avec un Chrome headless. Aucune dépendance Node ni Python.
#
#   ./build.sh                # cherche Chrome tout seul
#   CHROME=/chemin/chrome ./build.sh
#
# Pour refaire le QR code (si l'adresse change) :
#   uvx --from segno segno --error M --border 0 --scale 1 --dark '#030712' \
#       --light transparent --no-xmldecl --no-classes --no-size \
#       --output assets/qr-ohmywind.svg "https://ohmywind.fr"
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_PDF="$HERE/pdf"
OUT_PNG="$HERE/preview"
SRC="file://$HERE/flyer.html"

find_chrome() {
  if [[ -n "${CHROME:-}" ]]; then echo "$CHROME"; return; fi
  local c
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return; fi
  done
  # Le Chromium du cache Playwright (WSL sans Chrome système). Le plus récent.
  local cand
  cand="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell \
               "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$cand" ]]; then echo "$cand"; return; fi
  echo "Aucun Chrome trouvé : installer google-chrome ou passer CHROME=/chemin/vers/chrome" >&2
  exit 1
}

CHROME_BIN="$(find_chrome)"
echo "Chrome : $CHROME_BIN"
mkdir -p "$OUT_PDF" "$OUT_PNG"

# Options communes. --virtual-time-budget laisse le temps aux polices et à
# l'image de se charger avant la capture ; sans lui la première page sort
# parfois en police système.
COMMON=(
  --headless
  --disable-gpu
  --no-sandbox
  --hide-scrollbars
  --virtual-time-budget=5000
  --run-all-compositor-stages-before-draw
)

echo "→ pdf/flyer-a5.pdf"
"$CHROME_BIN" "${COMMON[@]}" --no-pdf-header-footer \
  --print-to-pdf="$OUT_PDF/flyer-a5.pdf" "$SRC" 2>/dev/null

echo "→ pdf/flyer-a4-2-par-page.pdf"
"$CHROME_BIN" "${COMMON[@]}" --no-pdf-header-footer \
  --print-to-pdf="$OUT_PDF/flyer-a4-2-par-page.pdf" "$SRC?sheet=a4" 2>/dev/null

# Aperçus à 2× (96 dpi × 2) : A5 = 559 × 794 px, A4 paysage = 1123 × 794 px.
# --print-to-pdf et --screenshot ne se combinent pas, d'où les deux passes.
echo "→ preview/flyer-a5.png"
"$CHROME_BIN" "${COMMON[@]}" --force-device-scale-factor=2 \
  --window-size=559,794 --screenshot="$OUT_PNG/flyer-a5.png" "$SRC?screen=raw" 2>/dev/null

echo "→ preview/flyer-a4-2-par-page.png"
"$CHROME_BIN" "${COMMON[@]}" --force-device-scale-factor=2 \
  --window-size=1123,794 --screenshot="$OUT_PNG/flyer-a4-2-par-page.png" "$SRC?sheet=a4&screen=raw" 2>/dev/null

ls -la "$OUT_PDF" "$OUT_PNG"
