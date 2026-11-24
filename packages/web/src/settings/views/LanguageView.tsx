// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { AVAILABLE_LANGS, LANG_NAMES, setLang, useT, type Lang } from "../../i18n";
import { SettingsNote, SettingsRadioList } from "../parts";

/**
 * « Langue »: the five languages, each named in itself (endonyms), so a
 * reader lost in the wrong one recognises their own. The choice applies at
 * once, the dictionary loading before the switch lands (see i18n/store); the
 * view stays open, now in the new language.
 */
export function LanguageView() {
  const { t, lang } = useT();
  return (
    <>
      <SettingsRadioList<Lang>
        label={t("config.lang.label")}
        value={lang}
        onChange={(l) => void setLang(l)}
        choices={AVAILABLE_LANGS.map((l) => ({ value: l, label: LANG_NAMES[l], lang: l }))}
      />
      <SettingsNote>{t("settings.lang.note")}</SettingsNote>
    </>
  );
}
