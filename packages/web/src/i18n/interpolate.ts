// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export type Params = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** "{count} jours" with { count: 3 } → "3 jours". An unknown name is left as
    written, which shows up in the UI instead of failing silently. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
