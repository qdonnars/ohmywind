// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import {
  defaultPolarConfig,
  loadPolarConfig,
  savePolarConfig,
  type PolarConfig,
} from "../config/polarConfig";
import { useT } from "../i18n";
import { BoatAdvanced } from "./BoatAdvanced";
import { BoatEssentials } from "./BoatEssentials";
import { BoatResult } from "./BoatResult";
import { ConfigTile } from "./ConfigTile";
import "../routes/config.css";

/**
 * The boat: intro, the Essentials, Advanced and resulting-polar tiles, and
 * the reset. The "Bateau" tab of /config, and for now the "Bateau" view of
 * the settings, which show it as it is.
 */
export function BoatEditor() {
  const { t } = useT();
  const [savedOnce, setSavedOnce] = useState(false);
  // Single owner of the boat/polar state: the tiles receive {config, onChange}
  // and never touch localStorage themselves, so the two of them always see
  // the same object and every change is persisted exactly once.
  const [polarCfg, setPolarCfg] = useState<PolarConfig>(() => loadPolarConfig());

  function updatePolar(next: PolarConfig) {
    // Any touch here re-selects the perso polar on /plan (its selector may
    // have parked it in favour of a stock archetype).
    const activated = { ...next, persoActive: true };
    setPolarCfg(activated);
    savePolarConfig(activated);
    setSavedOnce(true);
  }

  return (
    <>
      <p className="text-sm opacity-80 mb-8 leading-relaxed">{t("config.boat.intro")}</p>
      <div className="flex flex-col gap-5">
        <ConfigTile title={t("config.boat.essentials.title")}>
          <BoatEssentials config={polarCfg} onChange={updatePolar} />
        </ConfigTile>
        <ConfigTile
          title={t("config.boat.advanced.title")}
          subtitle={t("config.boat.advanced.subtitle")}
          collapsible
          defaultOpen={false}
        >
          <BoatAdvanced config={polarCfg} onChange={updatePolar} />
        </ConfigTile>
        <ConfigTile
          title={t("config.boat.result.title")}
          subtitle={t("config.boat.result.tileSubtitle")}
        >
          <BoatResult config={polarCfg} />
        </ConfigTile>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => updatePolar(defaultPolarConfig())}
            className="config-reset"
          >
            {t("config.boat.resetAll")}
          </button>
          {savedOnce && <span className="text-xs opacity-50">{t("config.saved")}</span>}
        </div>
      </div>
    </>
  );
}
