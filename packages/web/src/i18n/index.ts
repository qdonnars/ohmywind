// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export { AVAILABLE_LANGS, LANGS, LANG_NAMES, LOCALE_BY_LANG, isLang, type Lang } from "./types";
export { getLang, getLocale, initI18n, setLang, t, tn, type Key, type PluralKey } from "./store";
export { useLang, useT } from "./useT";
export { rich, type RichTags } from "./rich";
export type { Params } from "./interpolate";
