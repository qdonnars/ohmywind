// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The active language and its dictionary, as a module-level store.
 *
 * A store rather than a React context because half the copy is produced
 * outside the tree: API error messages, leg labels, date and number
 * formatters. They call `t()` directly; components subscribe through
 * `useT()` (useSyncExternalStore) and re-render when the language changes.
 *
 * French is bundled and is the fallback. Every other dictionary is its own
 * chunk, loaded on first use, so a French reader never downloads the others.
 */
import { fr, type Dict } from "./fr";
import { interpolate, type Params } from "./interpolate";
import { detectLang, readStoredLang, saveLang } from "./langPreference";
import { LOCALE_BY_LANG, type Lang } from "./types";

export type Key = keyof Dict;

type PluralBaseOf<K> = K extends `${infer B}.other` ? B : never;
/** A key that exists in `.one` / `.other` form, for `tn()`. */
export type PluralKey = PluralBaseOf<Key>;

let current: Lang = "fr";
let dict: Dict = fr;
const loaded: Partial<Record<Lang, Dict>> = { fr };
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

/** BCP 47 tag of the active language, for Intl. */
export function getLocale(): string {
  return LOCALE_BY_LANG[current];
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The string for `key` in the active language, placeholders filled in. */
export function t(key: Key, params?: Params): string {
  return interpolate(dict[key] ?? fr[key] ?? key, params);
}

const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * Plural form picked by the language's own rules (French counts zero as
 * singular, English does not), with `{count}` filled in.
 */
export function tn(base: PluralKey, count: number, params?: Params): string {
  const locale = getLocale();
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  const candidate = `${base}.${rules.select(count)}`;
  const key = (candidate in dict ? candidate : `${base}.other`) as Key;
  return t(key, { count, ...params });
}

async function loadDict(lang: Lang): Promise<Dict> {
  const have = loaded[lang];
  if (have) return have;
  let d: Dict;
  switch (lang) {
    case "en":
      d = (await import("./en")).en;
      break;
    case "de":
      d = (await import("./de")).de;
      break;
    case "it":
      d = (await import("./it")).it;
      break;
    default:
      d = fr;
  }
  loaded[lang] = d;
  return d;
}

function apply(lang: Lang, d: Dict): void {
  current = lang;
  dict = d;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

/** Switch language: loads the dictionary if needed, persists, re-renders. */
export async function setLang(lang: Lang): Promise<void> {
  const d = await loadDict(lang);
  saveLang(lang);
  apply(lang, d);
}

/**
 * Resolve the language at boot: the stored choice, else the browser's.
 * Awaited by main.tsx before the first render, so the page never paints in
 * one language and repaints in another.
 */
export async function initI18n(): Promise<Lang> {
  const stored = readStoredLang();
  const browser =
    typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : [];
  const lang = stored ?? detectLang(browser);
  apply(lang, await loadDict(lang));
  return lang;
}
