// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Every language the app knows about. `AVAILABLE_LANGS` is the subset that
 * ships a dictionary: the picker, the browser-language detection and the
 * stored preference only ever resolve to one of those. The two lists are
 * equal today; they split again the day a fifth language is being prepared.
 */
export const LANGS = ["fr", "en", "de", "it"] as const;
export type Lang = (typeof LANGS)[number];

export const AVAILABLE_LANGS: readonly Lang[] = LANGS;

/**
 * BCP 47 tag handed to Intl for dates and numbers. en-GB rather than en-US:
 * a 24-hour clock and day-first dates are what a sailor expects on a plan.
 */
export const LOCALE_BY_LANG: Record<Lang, string> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  it: "it-IT",
};

/** Endonyms, shown as-is in the picker whatever the active language. */
export const LANG_NAMES: Record<Lang, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
};

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}
