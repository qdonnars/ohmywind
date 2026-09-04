// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useRef, useState } from "react";
import { rich, useT } from "../i18n";
import {
  ARCHETYPE_LABELS,
  MIN_UPWIND_MAX,
  MIN_UPWIND_MIN,
  SPI_MAX_TWS_MAX,
  SPI_MAX_TWS_MIN,
  commitSpiMaxTwsDraft,
  effectiveMinUpwind,
  effectivePolar,
  hasOverrides,
  isImportedActive,
  parseSpiMaxTwsDraft,
  type PolarConfig,
  type PolarSource,
  type SpiKind,
} from "../config/polarConfig";
import { parsePolarFile, PolarImportError } from "../config/polarImport";
import { PolarDiagram, TwsPills } from "./PolarDiagram";

// Refuse absurdly large uploads before parsing: a real polar file weighs a
// few kB; past this size it's the wrong file.
const IMPORT_MAX_BYTES = 512 * 1024;

// "Avancé" tile: polar file import, minimum upwind angle, spinnaker settings
// and manual cell-by-cell tuning — everything a sailor who knows their boat's
// numbers may want, none of it required for a first plan.
interface BoatAdvancedProps {
  config: PolarConfig;
  onChange: (next: PolarConfig) => void;
}

export function BoatAdvanced({ config, onChange }: BoatAdvancedProps) {
  const { t } = useT();
  const [importNotice, setImportNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [tuningOpen, setTuningOpen] = useState(false);
  const [selectedTwsIdx, setSelectedTwsIdx] = useState(0);
  const [spiMaxTwsDraft, setSpiMaxTwsDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importedActive = isImportedActive(config);

  async function importFile(file: File) {
    if (file.size > IMPORT_MAX_BYTES) {
      setImportNotice({ kind: "error", text: t("config.polarImport.tooLarge") });
      return;
    }
    try {
      const parsed = parsePolarFile(await file.text());
      const name =
        file.name.replace(/\.[^.]+$/, "").slice(0, 120) || t("config.polarImport.defaultName");
      // A fresh file is trusted as-is: no spi overlay, upwind angle re-derived
      // from the grid (the previous file's manual pin no longer applies).
      onChange({
        ...config,
        imported: {
          name,
          tws_kn: parsed.tws_kn,
          twa_deg: parsed.twa_deg,
          boat_speed_kn: parsed.boat_speed_kn,
        },
        source: "imported",
        spi: "off",
        minUpwindDeg: undefined,
      });
      setSelectedTwsIdx(0);
      const done = t("config.polarImport.ok", {
        name,
        tws: parsed.tws_kn.length,
        twa: parsed.twa_deg.length,
      });
      // The parser's warnings are whole sentences of their own, already
      // translated: they follow the confirmation, they are not woven into it.
      const suffix = parsed.warnings.length > 0 ? ` ${parsed.warnings.join(" ")}` : "";
      setImportNotice({ kind: "ok", text: `${done}${suffix}` });
    } catch (e) {
      setImportNotice({
        kind: "error",
        text: e instanceof PolarImportError ? e.message : t("config.polarImport.unreadable"),
      });
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same (fixed) file again re-triggers onChange.
    e.target.value = "";
    if (file) void importFile(file);
  }

  function setSource(source: PolarSource) {
    if (source === config.source) return;
    onChange({ ...config, source });
    setSelectedTwsIdx(0);
  }

  function removeImported() {
    onChange({ ...config, imported: null, source: "archetype" });
    setImportNotice(null);
    setSelectedTwsIdx(0);
  }

  function setMinUpwind(raw: string) {
    const val = raw.trim();
    if (val === "") {
      onChange({ ...config, minUpwindDeg: undefined });
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num)) return;
    onChange({
      ...config,
      minUpwindDeg: Math.round(Math.min(MIN_UPWIND_MAX, Math.max(MIN_UPWIND_MIN, num))),
    });
  }

  function setSpi(spi: SpiKind) {
    onChange({ ...config, spi });
  }

  // While the field is focused the raw text is what gets rendered, so an
  // empty field stays empty and a typed digit stays the digit that was typed
  // (see parseSpiMaxTwsDraft for why driving the input straight off the
  // config paints a zero the user never entered). null = not editing.
  function setSpiMaxTws(raw: string) {
    setSpiMaxTwsDraft(raw);
    const next = parseSpiMaxTwsDraft(raw);
    if (next !== null && next !== config.spiMaxTwsKn) {
      onChange({ ...config, spiMaxTwsKn: next });
    }
  }

  function commitSpiMaxTws() {
    const next = commitSpiMaxTwsDraft(spiMaxTwsDraft ?? "");
    setSpiMaxTwsDraft(null);
    if (next !== null && next !== config.spiMaxTwsKn) {
      onChange({ ...config, spiMaxTwsKn: next });
    }
  }

  function setOverride(twsIdx: number, twaIdx: number, speedKn: number) {
    const clamped = Math.max(0, Math.min(30, Math.round(speedKn * 10) / 10));
    onChange({
      ...config,
      overrides: { ...config.overrides, [`${twsIdx},${twaIdx}`]: clamped },
    });
  }

  function clearOverrides() {
    onChange({ ...config, overrides: {} });
  }

  const autoMinUpwind = effectiveMinUpwind({ ...config, minUpwindDeg: undefined });
  // Manual tuning edits the RAW effective matrix (spi + overrides, no
  // coefficient): dragged values are stored as absolute overrides.
  const effective = useMemo(() => effectivePolar(config), [config]);
  const overriddenKeys = useMemo(() => new Set(Object.keys(config.overrides)), [config.overrides]);
  const overrideCount = Object.keys(config.overrides).length;

  return (
    <>
      {/* Polar file import. The uploaded polar replaces the archetype-derived
          matrix wholesale; the archetype editor state is kept so the user can
          flip back at any time. */}
      <div className="polar-block">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider opacity-70">
            {t("config.boat.advanced.polarFile")}
          </span>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="polar-btn polar-btn-accent"
            >
              {config.imported
                ? t("config.boat.advanced.replaceFile")
                : t("config.boat.advanced.importFile")}
            </button>
            {config.imported && (
              <button type="button" onClick={removeImported} className="polar-btn">
                {t("config.boat.advanced.removeFile")}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pol,.csv,.txt,.tsv,.dat,text/plain,text/csv"
            onChange={onFilePicked}
            className="hidden"
          />
        </div>
        {config.imported ? (
          <div className="polar-import-current">
            <span className="polar-import-name">{config.imported.name}</span>
            <span className="opacity-60">
              {" "}
              · {config.imported.tws_kn.length} TWS × {config.imported.twa_deg.length} TWA
            </span>
            <div
              className="polar-source-segment mt-2"
              role="radiogroup"
              aria-label={t("config.boat.advanced.activePolar")}
            >
              <button
                type="button"
                role="radio"
                aria-checked={config.source === "imported"}
                onClick={() => setSource("imported")}
                className={`polar-spi-btn ${config.source === "imported" ? "is-active" : ""}`}
              >
                {t("config.boat.advanced.sourceImported")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={config.source === "archetype"}
                onClick={() => setSource("archetype")}
                className={`polar-spi-btn ${config.source === "archetype" ? "is-active" : ""}`}
              >
                {t("config.boat.advanced.sourceArchetype")}
              </button>
            </div>
          </div>
        ) : (
          <p className="polar-hint">{t("config.boat.advanced.formatHint")}</p>
        )}
        {importNotice && (
          <p className={`polar-import-notice ${importNotice.kind === "ok" ? "is-ok" : "is-error"}`}>
            {importNotice.text}
          </p>
        )}
        <p className="polar-hint">
          {rich(t("config.boat.advanced.exampleFile"), {
            a: (chunk) => (
              <a
                href="/polars/exemple-polaire.csv"
                download
                className="underline"
                style={{ color: "var(--ow-accent)" }}
              >
                {chunk}
              </a>
            ),
          })}
        </p>
      </div>

      {/* Minimum upwind angle — no-go boundary for display AND simulation. */}
      <div className="polar-block">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider opacity-70">
            {t("config.boat.advanced.minUpwind")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min={MIN_UPWIND_MIN}
            max={MIN_UPWIND_MAX}
            placeholder={t("config.boat.advanced.minUpwindPlaceholder", { deg: autoMinUpwind })}
            value={config.minUpwindDeg ?? ""}
            onChange={(e) => setMinUpwind(e.target.value)}
            className="polar-motor-input w-28"
          />
          {config.minUpwindDeg !== undefined && (
            <button
              type="button"
              onClick={() => onChange({ ...config, minUpwindDeg: undefined })}
              className="polar-btn"
            >
              {t("config.boat.advanced.minUpwindAuto")}
            </button>
          )}
        </div>
        <p className="polar-hint">
          {t("config.boat.advanced.minUpwindHint", {
            archetype: ARCHETYPE_LABELS[config.base],
          })}
        </p>
      </div>

      {/* Spinnaker: sail type + wind ceiling. Locked while an imported polar
          is active — the file is presumed to already include the boat's sail
          inventory, so an extra boost would double-count it. */}
      <div className={`polar-block ${importedActive ? "polar-block-disabled" : ""}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider opacity-70">
            {t("config.boat.advanced.spinnaker")}
          </span>
          <div
            className="polar-spi-segment"
            role="radiogroup"
            aria-label={t("config.boat.advanced.spiKind")}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "off"}
              disabled={importedActive}
              onClick={() => setSpi("off")}
              className={`polar-spi-btn ${!importedActive && config.spi === "off" ? "is-active" : ""}`}
            >
              {t("config.boat.advanced.spiOff")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "asymmetric"}
              disabled={importedActive}
              onClick={() => setSpi("asymmetric")}
              className={`polar-spi-btn ${!importedActive && config.spi === "asymmetric" ? "is-active" : ""}`}
              title={t("config.boat.advanced.spiAsymmetricTitle")}
            >
              {t("config.boat.advanced.spiAsymmetric")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "symmetric"}
              disabled={importedActive}
              onClick={() => setSpi("symmetric")}
              className={`polar-spi-btn ${!importedActive && config.spi === "symmetric" ? "is-active" : ""}`}
              title={t("config.boat.advanced.spiSymmetricTitle")}
            >
              {t("config.boat.advanced.spiSymmetric")}
            </button>
          </div>
          {!importedActive && config.spi !== "off" && (
            <label className="flex items-center gap-2 text-xs opacity-80">
              {t("config.boat.advanced.spiDouse")}
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min={SPI_MAX_TWS_MIN}
                max={SPI_MAX_TWS_MAX}
                value={spiMaxTwsDraft ?? config.spiMaxTwsKn}
                onChange={(e) => setSpiMaxTws(e.target.value)}
                onBlur={commitSpiMaxTws}
                className="polar-motor-input w-20"
              />
              kn
            </label>
          )}
        </div>
        {importedActive ? (
          <p className="polar-hint">{t("config.boat.advanced.spiLocked")}</p>
        ) : (
          config.spi !== "off" && (
            <p className="polar-hint">{t("config.boat.advanced.spiThresholdHint")}</p>
          )
        )}
      </div>

      {/* Manual fine-tuning — archetype grids only: overrides are keyed to the
          archetype grid and an imported file is the user's own data already. */}
      {!importedActive && (
        <div className="polar-block">
          <button
            type="button"
            className="polar-tuning-toggle"
            aria-expanded={tuningOpen}
            onClick={() => setTuningOpen(!tuningOpen)}
          >
            <span className="text-xs uppercase tracking-wider opacity-70">
              {t("config.boat.advanced.tuning")}
              {overrideCount > 0
                ? ` · ${t("config.boat.advanced.tunedPoints", { count: overrideCount })}`
                : ""}
            </span>
            <span className={`config-tile-chevron ${tuningOpen ? "is-open" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          {tuningOpen && (
            <>
              <p className="polar-hint">{t("config.boat.advanced.tuningHint")}</p>
              <TwsPills
                twsKn={effective.tws_kn}
                selectedIdx={selectedTwsIdx}
                onSelect={setSelectedTwsIdx}
                label={t("config.polar.curveEditable")}
              />
              <PolarDiagram
                title={ARCHETYPE_LABELS[config.base]}
                subtitle={t("config.boat.advanced.rawSubtitle")}
                twsKn={effective.tws_kn}
                twaDeg={effective.twa_deg}
                matrix={effective.boat_speed_kn}
                selectedTwsIdx={selectedTwsIdx}
                minUpwindDeg={effectiveMinUpwind(config)}
                editable
                overriddenKeys={overriddenKeys}
                onCellChange={setOverride}
              />
              {hasOverrides(config) && (
                <div>
                  <button type="button" onClick={clearOverrides} className="polar-btn">
                    {t("config.boat.advanced.clearTuning")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
