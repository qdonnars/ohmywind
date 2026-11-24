// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { PolarDiagram } from "../../components/PolarDiagram";
import {
  TUNE_STEP_KN,
  importPolarFile,
  saveBoatEdit,
  stepMinUpwind,
  stepSpiMaxTws,
  withOverride,
  withoutImported,
  type ImportNotice,
} from "../../config/boatEdits";
import {
  ARCHETYPE_LABELS,
  MIN_UPWIND_MAX,
  MIN_UPWIND_MIN,
  SPI_MAX_TWS_MAX,
  SPI_MAX_TWS_MIN,
  effectiveMinUpwind,
  effectivePolar,
  hasOverrides,
  isImportedActive,
  type PolarSource,
  type SpiKind,
} from "../../config/polarConfig";
import { usePolarConfig } from "../../config/usePolarConfig";
import { getLocale, rich, useT } from "../../i18n";
import { SettingsGroup, SettingsGroupTitle, SettingsNote } from "../parts";
import { BoatSegmented, BoatStepper, CurveChips } from "./boatParts";

/**
 * « Avancé »: what a sailor who knows their boat's numbers may set, none of
 * it needed for a first plan. Their own polar file, the minimum upwind
 * angle, the spinnaker and the hand tuning of the polar, point by point.
 * Same rules as the "Avancé" tile of /config (`config/boatEdits`), every
 * change stored as it is made.
 */
export function BoatAdvancedView() {
  const { t } = useT();
  const cfg = usePolarConfig();
  const importedActive = isImportedActive(cfg);
  const [notice, setNotice] = useState<ImportNotice | null>(null);
  const [curve, setCurve] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Emptied so that picking the same file again, once fixed, reads it.
    e.target.value = "";
    if (!file) return;
    const { next, notice } = await importPolarFile(cfg, file);
    if (next) {
      saveBoatEdit(next);
      setCurve(0);
    }
    setNotice(notice);
  }

  const setSource = (source: PolarSource) => {
    if (source === cfg.source) return;
    saveBoatEdit({ ...cfg, source });
    setCurve(0);
  };

  const removeImported = () => {
    saveBoatEdit(withoutImported(cfg));
    setNotice(null);
    setCurve(0);
  };

  const upwind = effectiveMinUpwind(cfg);
  const upwindPinned = cfg.minUpwindDeg !== undefined;

  // Hand tuning edits the raw effective matrix (spinnaker and tuned points,
  // no coefficient): a moved point is stored as an absolute speed. The
  // dashed curve is the same matrix without the tuned points.
  const effective = useMemo(() => effectivePolar(cfg), [cfg]);
  const untuned = useMemo(() => effectivePolar({ ...cfg, overrides: {} }), [cfg]);
  const tunedKeys = useMemo(() => new Set(Object.keys(cfg.overrides)), [cfg.overrides]);
  const tunedCount = tunedKeys.size;
  const activeCurve = Math.min(curve, effective.tws_kn.length - 1);
  const step = new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 1 }).format(TUNE_STEP_KN);

  return (
    <>
      {/* Their own polar file: it replaces the archetype's matrix as a
          whole; the archetype's settings are kept, to go back to them. */}
      <SettingsGroupTitle>{t("config.boat.advanced.polarFile")}</SettingsGroupTitle>
      <SettingsGroup>
        {cfg.imported && (
          <div className="ow-settings-row">
            <svg className="ow-boat-file-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6" />
            </svg>
            <span className="ow-settings-row-text">
              <span className="block ow-boat-file-name">{cfg.imported.name}</span>
              <span className="ow-settings-row-sub">
                {cfg.imported.tws_kn.length} TWS × {cfg.imported.twa_deg.length} TWA
              </span>
            </span>
          </div>
        )}
        <div className={cfg.imported ? "ow-boat-file-actions" : undefined}>
          <button type="button" className="ow-settings-row ow-boat-action" onClick={() => fileRef.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
            </svg>
            <span className="ow-settings-row-text">
              {cfg.imported ? t("config.boat.advanced.replaceFile") : t("config.boat.advanced.importFile")}
            </span>
          </button>
          {cfg.imported && (
            <button type="button" className="ow-boat-danger ow-boat-danger-inline" onClick={removeImported}>
              {t("config.boat.advanced.removeFile")}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pol,.csv,.txt,.tsv,.dat,text/plain,text/csv"
          onChange={(e) => void onFilePicked(e)}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
      </SettingsGroup>
      <div role="status">
        {notice && (
          <p className={`ow-settings-note ${notice.kind === "ok" ? "ow-boat-ok" : "ow-boat-warn"}`}>{notice.text}</p>
        )}
      </div>
      {!cfg.imported && <SettingsNote>{t("config.boat.advanced.formatHint")}</SettingsNote>}
      <SettingsNote>
        {rich(t("config.boat.advanced.exampleFile"), {
          a: (chunk) => (
            <a href="/polars/exemple-polaire.csv" download className="ow-boat-link-inline">
              {chunk}
            </a>
          ),
        })}
      </SettingsNote>

      {cfg.imported && (
        <>
          <SettingsGroupTitle>{t("config.boat.advanced.activePolar")}</SettingsGroupTitle>
          <BoatSegmented<PolarSource>
            label={t("config.boat.advanced.activePolar")}
            value={cfg.source}
            onChange={setSource}
            choices={[
              { value: "imported", label: t("config.boat.advanced.sourceImported") },
              { value: "archetype", label: t("config.boat.advanced.sourceArchetype") },
            ]}
          />
        </>
      )}

      {/* The no-go boundary, for the diagram and the simulation alike. */}
      <SettingsGroupTitle>{t("config.boat.advanced.minUpwind")}</SettingsGroupTitle>
      <SettingsGroup>
        <div className="ow-settings-row">
          <span className="ow-settings-row-text">
            <span className="block ow-boat-value">{upwind}°</span>
            <span className="ow-settings-row-sub">
              {upwindPinned ? t("settings.boat.upwind.manual") : t("config.boat.advanced.minUpwindAuto")}
            </span>
          </span>
          {upwindPinned && (
            <button
              type="button"
              className="ow-boat-pill"
              onClick={() => saveBoatEdit({ ...cfg, minUpwindDeg: undefined })}
            >
              {t("config.boat.advanced.minUpwindAuto")}
            </button>
          )}
          <BoatStepper
            minusLabel={t("settings.boat.upwind.tighter")}
            plusLabel={t("settings.boat.upwind.wider")}
            canMinus={upwind > MIN_UPWIND_MIN}
            canPlus={upwind < MIN_UPWIND_MAX}
            onMinus={() => saveBoatEdit(stepMinUpwind(cfg, -1))}
            onPlus={() => saveBoatEdit(stepMinUpwind(cfg, 1))}
          />
        </div>
      </SettingsGroup>
      <SettingsNote>
        {t("config.boat.advanced.minUpwindHint", { archetype: ARCHETYPE_LABELS[cfg.base] })}
      </SettingsNote>

      {/* Spinnaker: locked while an imported polar is active, the file being
          presumed to hold the boat's sails already; a boost on top would
          count them twice. */}
      <SettingsGroupTitle>{t("config.boat.advanced.spinnaker")}</SettingsGroupTitle>
      <BoatSegmented<SpiKind>
        label={t("config.boat.advanced.spiKind")}
        value={importedActive ? null : cfg.spi}
        disabled={importedActive}
        onChange={(spi) => saveBoatEdit({ ...cfg, spi })}
        choices={[
          { value: "off", label: t("config.boat.advanced.spiOff") },
          { value: "asymmetric", label: t("config.boat.advanced.spiAsymmetric") },
          { value: "symmetric", label: t("config.boat.advanced.spiSymmetric") },
        ]}
      />
      {importedActive ? (
        <p className="ow-settings-note ow-boat-warn ow-boat-after-segment">{t("config.boat.advanced.spiLocked")}</p>
      ) : (
        cfg.spi !== "off" && (
          <>
            <p className="ow-settings-note ow-boat-after-segment">
              {t(
                cfg.spi === "asymmetric"
                  ? "config.boat.advanced.spiAsymmetricTitle"
                  : "config.boat.advanced.spiSymmetricTitle",
              )}
            </p>
            <div className="ow-boat-spaced-sm">
              <SettingsGroup>
                <div className="ow-settings-row">
                  <span className="ow-settings-row-text">{t("config.boat.advanced.spiDouse")}</span>
                  <span className="ow-boat-value ow-boat-value-accent">{cfg.spiMaxTwsKn}&nbsp;kn</span>
                  <BoatStepper
                    minusLabel={t("settings.boat.spi.lower")}
                    plusLabel={t("settings.boat.spi.higher")}
                    canMinus={cfg.spiMaxTwsKn > SPI_MAX_TWS_MIN}
                    canPlus={cfg.spiMaxTwsKn < SPI_MAX_TWS_MAX}
                    onMinus={() => saveBoatEdit(stepSpiMaxTws(cfg, -1))}
                    onPlus={() => saveBoatEdit(stepSpiMaxTws(cfg, 1))}
                  />
                </div>
              </SettingsGroup>
            </div>
            <SettingsNote>{t("config.boat.advanced.spiThresholdHint")}</SettingsNote>
          </>
        )
      )}

      {/* Hand tuning, on the archetype only: tuned points are keyed to the
          archetype's grid, and an imported file is the reader's own data. */}
      {!importedActive && (
        <>
          <div className="ow-boat-title-row">
            <SettingsGroupTitle>{t("config.boat.advanced.tuning")}</SettingsGroupTitle>
            {tunedCount > 0 && (
              <span className="ow-boat-tuned">{t("config.boat.advanced.tunedPoints", { count: tunedCount })}</span>
            )}
          </div>
          <div className="ow-settings-group ow-boat-card">
            <CurveChips
              label={t("config.polar.curveEditable")}
              twsKn={effective.tws_kn}
              selected={activeCurve}
              onSelect={setCurve}
            />
            <div className="ow-boat-diagram">
              <PolarDiagram
                title={ARCHETYPE_LABELS[cfg.base]}
                subtitle={t("config.boat.advanced.rawSubtitle")}
                twsKn={effective.tws_kn}
                twaDeg={effective.twa_deg}
                matrix={effective.boat_speed_kn}
                baseline={untuned.boat_speed_kn[activeCurve]}
                selectedTwsIdx={activeCurve}
                minUpwindDeg={upwind}
                editable
                overriddenKeys={tunedKeys}
                onCellChange={(twsIdx, twaIdx, speed) => saveBoatEdit(withOverride(cfg, twsIdx, twaIdx, speed))}
              />
            </div>
          </div>
          <SettingsNote>{t("config.boat.advanced.tuningHint")}</SettingsNote>
          <SettingsNote>{t("settings.boat.tuning.legend", { step })}</SettingsNote>
          <button
            type="button"
            className="ow-boat-danger"
            disabled={!hasOverrides(cfg)}
            onClick={() => saveBoatEdit({ ...cfg, overrides: {} })}
          >
            {t("config.boat.advanced.clearTuning")}
          </button>
        </>
      )}
    </>
  );
}
