// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useKeepAwakePreference } from "../../config/useKeepAwakePreference";
import type { ThemePreference } from "../../design/useTheme";
import { useTheme } from "../../design/useTheme";
import { useSeamarks } from "../../hooks/useSeamarks";
import { LANG_NAMES, useT } from "../../i18n";
import { useSettingsNav } from "../nav";
import {
  SettingsGroup,
  SettingsGroupTitle,
  SettingsLinkRow,
  SettingsNote,
  SettingsRow,
  SettingsSegmented,
  SettingsSwitchRow,
} from "../parts";
import { useBoatSummary } from "./useBoatSummary";
import { useModelsSummary } from "./useModelsSummary";

/**
 * « Réglages », the view the settings always open on: the device (theme,
 * language, screen), the map (sea marks) and the forecasts (models, boat).
 * Every control saves at once; there is no save step.
 */
export function RootView() {
  const { t, lang } = useT();
  const nav = useSettingsNav();
  const { preference, setPreference } = useTheme();
  const keepAwake = useKeepAwakePreference();
  const seamarks = useSeamarks();
  const modelsSummary = useModelsSummary();
  const boatSummary = useBoatSummary();

  const themeLabel = t("settings.theme.label");
  const seamarksLabel = t("settings.seamarks.label");

  return (
    <>
      <SettingsGroupTitle>{t("settings.group.device")}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsRow label={themeLabel}>
          <SettingsSegmented<ThemePreference>
            label={themeLabel}
            minWidth={186}
            value={preference}
            onChange={setPreference}
            choices={[
              { value: "auto", label: t("settings.theme.auto") },
              { value: "light", label: t("settings.theme.light") },
              { value: "dark", label: t("settings.theme.dark") },
            ]}
          />
        </SettingsRow>
        <SettingsLinkRow
          label={t("config.lang.label")}
          value={<span lang={lang}>{LANG_NAMES[lang]}</span>}
          onOpen={() => nav.push("language")}
        />
        <SettingsSwitchRow
          label={t("config.keepAwake.label")}
          subtitle={t("settings.keepAwake.subtitle")}
          checked={keepAwake.enabled}
          onChange={keepAwake.setEnabled}
        />
      </SettingsGroup>
      <SettingsNote>{t("settings.device.note")}</SettingsNote>

      <SettingsGroupTitle>{t("settings.group.map")}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsRow label={seamarksLabel} subtitle={t("settings.seamarks.subtitle")}>
          <SettingsSegmented<"always" | "never">
            label={seamarksLabel}
            minWidth={152}
            value={seamarks.enabled ? "always" : "never"}
            onChange={(v) => seamarks.setEnabled(v === "always")}
            choices={[
              { value: "always", label: t("settings.seamarks.always") },
              { value: "never", label: t("settings.seamarks.never") },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsNote>{t("settings.map.note")}</SettingsNote>

      <SettingsGroupTitle>{t("settings.group.forecast")}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsLinkRow
          label={t("config.models.title")}
          subtitle={modelsSummary}
          onOpen={() => nav.push("models")}
        />
        <SettingsLinkRow
          label={t("config.boat.title")}
          subtitle={boatSummary}
          onOpen={() => nav.push("boat")}
        />
      </SettingsGroup>
      <SettingsNote>{t("settings.forecast.note")}</SettingsNote>

      <SettingsNote footnote>{t("settings.storageNote")}</SettingsNote>
    </>
  );
}
