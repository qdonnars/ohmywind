// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export {
  AVAILABLE_LANGS,
  LANG_NAMES,
  LANG_SHORT_NAMES,
  LOCALE_BY_LANG,
  type Lang,
} from "./types";
export { getLang, getLocale, hasKey, initI18n, setLang, t, tn, type Key } from "./store";
export { useLang, useT } from "./useT";
export { rich } from "./rich";
