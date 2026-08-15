// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useRef, useState } from "react";
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
  const [importNotice, setImportNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [tuningOpen, setTuningOpen] = useState(false);
  const [selectedTwsIdx, setSelectedTwsIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importedActive = isImportedActive(config);

  async function importFile(file: File) {
    if (file.size > IMPORT_MAX_BYTES) {
      setImportNotice({
        kind: "error",
        text: "Fichier trop volumineux : une polaire fait quelques ko, vérifiez que c'est le bon fichier.",
      });
      return;
    }
    try {
      const parsed = parsePolarFile(await file.text());
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Polaire importée";
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
      const dims = `${parsed.tws_kn.length} vitesses de vent × ${parsed.twa_deg.length} angles`;
      const suffix = parsed.warnings.length > 0 ? ` ${parsed.warnings.join(" ")}` : "";
      setImportNotice({ kind: "ok", text: `« ${name} » importée (${dims}).${suffix}` });
    } catch (e) {
      setImportNotice({
        kind: "error",
        text:
          e instanceof PolarImportError
            ? e.message
            : "Impossible de lire ce fichier. Format attendu : texte avec une ligne d'en-tête TWS puis une ligne par angle TWA.",
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

  function setSpiMaxTws(raw: string) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    onChange({
      ...config,
      spiMaxTwsKn: Math.round(Math.min(SPI_MAX_TWS_MAX, Math.max(SPI_MAX_TWS_MIN, num))),
    });
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
          <span className="text-xs uppercase tracking-wider opacity-70">Fichier de polaire</span>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="polar-btn polar-btn-accent"
            >
              {config.imported ? "Remplacer le fichier…" : "Importer un fichier…"}
            </button>
            {config.imported && (
              <button type="button" onClick={removeImported} className="polar-btn">
                Supprimer
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
            <div className="polar-source-segment mt-2" role="radiogroup" aria-label="Polaire active">
              <button
                type="button"
                role="radio"
                aria-checked={config.source === "imported"}
                onClick={() => setSource("imported")}
                className={`polar-spi-btn ${config.source === "imported" ? "is-active" : ""}`}
              >
                Polaire importée
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={config.source === "archetype"}
                onClick={() => setSource("archetype")}
                className={`polar-spi-btn ${config.source === "archetype" ? "is-active" : ""}`}
              >
                Archétype ajusté
              </button>
            </div>
          </div>
        ) : (
          <p className="polar-hint">
            Format standard (qtVlm, Expedition, MaxSea) : première ligne = vitesses
            de vent (TWS), une ligne par angle (TWA), séparées par tabulations,
            points-virgules ou virgules. Extensions .pol, .csv ou .txt.
          </p>
        )}
        {importNotice && (
          <p className={`polar-import-notice ${importNotice.kind === "ok" ? "is-ok" : "is-error"}`}>
            {importNotice.text}
          </p>
        )}
        <p className="polar-hint">
          <a
            href="/polars/exemple-polaire.csv"
            download
            className="underline"
            style={{ color: "var(--ow-accent)" }}
          >
            Télécharger un fichier d'exemple (.csv)
          </a>{" "}
          : la polaire du croiseur 30 pieds, à ouvrir dans un tableur et remplacer
          par les valeurs de votre bateau.
        </p>
      </div>

      {/* Minimum upwind angle — no-go boundary for display AND simulation. */}
      <div className="polar-block">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider opacity-70">
            Angle de près minimal
          </span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min={MIN_UPWIND_MIN}
            max={MIN_UPWIND_MAX}
            placeholder={`auto (${autoMinUpwind}°)`}
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
              Auto
            </button>
          )}
        </div>
        <p className="polar-hint">
          En dessous de cet angle du vent, le bateau ne remonte plus : le simulateur
          tire des bords à l'angle de VMG optimal et le diagramme grise la zone morte.
          Auto = valeur de l'archétype ({ARCHETYPE_LABELS[config.base]}), ou premier
          angle du fichier importé. Un angle plus serré que les données de la polaire
          prolonge la courbe à VMG constant, sans améliorer les vitesses simulées.
        </p>
      </div>

      {/* Spinnaker: sail type + wind ceiling. Locked while an imported polar
          is active — the file is presumed to already include the boat's sail
          inventory, so an extra boost would double-count it. */}
      <div className={`polar-block ${importedActive ? "polar-block-disabled" : ""}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider opacity-70">Spinnaker</span>
          <div className="polar-spi-segment" role="radiogroup" aria-label="Type de spi">
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "off"}
              disabled={importedActive}
              onClick={() => setSpi("off")}
              className={`polar-spi-btn ${!importedActive && config.spi === "off" ? "is-active" : ""}`}
            >
              Aucun
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "asymmetric"}
              disabled={importedActive}
              onClick={() => setSpi("asymmetric")}
              className={`polar-spi-btn ${!importedActive && config.spi === "asymmetric" ? "is-active" : ""}`}
              title="Asymétrique : sweet spot reaching 110-135°, utile jusqu'à 150° en heat-up"
            >
              Asymétrique
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!importedActive && config.spi === "symmetric"}
              disabled={importedActive}
              onClick={() => setSpi("symmetric")}
              className={`polar-spi-btn ${!importedActive && config.spi === "symmetric" ? "is-active" : ""}`}
              title="Symétrique : optimal au plein-vent arrière, 135-165° (pole requis)"
            >
              Symétrique
            </button>
          </div>
          {!importedActive && config.spi !== "off" && (
            <label className="flex items-center gap-2 text-xs opacity-80">
              Affaler au-dessus de
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min={SPI_MAX_TWS_MIN}
                max={SPI_MAX_TWS_MAX}
                value={config.spiMaxTwsKn}
                onChange={(e) => setSpiMaxTws(e.target.value)}
                className="polar-motor-input w-20"
              />
              kn
            </label>
          )}
        </div>
        {importedActive ? (
          <p className="polar-hint">
            Polaire importée active : le réglage spi est verrouillé, votre fichier est
            supposé refléter déjà votre garde-robe de voiles.
          </p>
        ) : (
          config.spi !== "off" && (
            <p className="polar-hint">
              Le gain de vitesse au portant ne s'applique qu'aux courbes de vent
              inférieures ou égales à ce seuil.
            </p>
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
              Ajustement manuel
              {overrideCount > 0 ? ` · ${overrideCount} point(s) ajusté(s)` : ""}
            </span>
            <span className={`config-tile-chevron ${tuningOpen ? "is-open" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          {tuningOpen && (
            <>
              <p className="polar-hint">
                Glissez un point de la courbe sélectionnée pour fixer sa vitesse
                (valeurs brutes, avant coefficient). Les points ajustés restent
                quand vous changez de spi.
              </p>
              <TwsPills
                twsKn={effective.tws_kn}
                selectedIdx={selectedTwsIdx}
                onSelect={setSelectedTwsIdx}
                label="Courbe éditable (TWS)"
              />
              <PolarDiagram
                title={ARCHETYPE_LABELS[config.base]}
                subtitle="valeurs brutes · glisser pour ajuster"
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
                    Effacer les ajustements
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
