// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// 9 Beaufort steps — 0-50 kn, covers Mediterranean mistral (35-40 kn)
const BEAUFORT_STEPS: [number, string, string][] = [
  //  kn_max, bg_color,   text_color
  [4,   '#1e2d40', '#e8eaf0'],   // B0 calm
  [7,   '#0e7c4a', '#e8eaf0'],   // B1 light air
  [11,  '#12a35e', '#0B1D14'],   // B2 light breeze
  [15,  '#2dc97a', '#0B1D14'],   // B3 gentle breeze
  [19,  '#e8c432', '#0B1D14'],   // B4 moderate breeze
  [23,  '#e87a18', '#0B1D14'],   // B5 fresh breeze
  [28,  '#e84118', '#fff5f5'],   // B6 strong breeze
  [33,  '#c41408', '#fff5f5'],   // B7 near gale
  [Infinity, '#8b1460', '#fff5f5'], // B8 gale+
];

export function getWindColor(knots: number): string {
  if (knots == null || isNaN(knots)) return '#1e2d40';
  for (const [max, bg] of BEAUFORT_STEPS) {
    if (knots < max) return bg;
  }
  return BEAUFORT_STEPS[BEAUFORT_STEPS.length - 1][1];
}

export function getTextColor(knots: number): string {
  if (knots == null || isNaN(knots)) return '#e8eaf0';
  for (const [max, , text] of BEAUFORT_STEPS) {
    if (knots < max) return text;
  }
  return BEAUFORT_STEPS[BEAUFORT_STEPS.length - 1][2];
}

// Returns Beaufort number (0-8) for legend
export function getBeaufortLevel(knots: number): number {
  const maxes = [4, 7, 11, 15, 19, 23, 28, 33];
  return maxes.findIndex(m => knots < m) === -1 ? 8 : maxes.findIndex(m => knots < m);
}

// Expose steps for legend rendering
export { BEAUFORT_STEPS };
