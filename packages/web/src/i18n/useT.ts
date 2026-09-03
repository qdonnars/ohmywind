// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";
import { getLang, subscribe, t, tn } from "./store";
import { LOCALE_BY_LANG, type Lang } from "./types";

/** The active language, re-rendering the caller when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/**
 * `t` and `tn` for a component, plus the language and locale it renders in.
 * The two functions are the module-level ones; subscribing is what makes a
 * language switch reach this component.
 */
export function useT() {
  const lang = useLang();
  return { t, tn, lang, locale: LOCALE_BY_LANG[lang] };
}
