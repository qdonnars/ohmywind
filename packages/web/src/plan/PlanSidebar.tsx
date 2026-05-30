import { useMemo, useState } from "react";
import { useTheme } from "../design/theme";
import type { PassageReport, ComplexityScore, Archetype, PassageWindow } from "./types";
import { aggregateLegs, buildLegSummaryCells, type AggregatedLeg } from "./aggregateLegs";
import { cxLevel, CX_COLORS } from "./types";
import { WindowsTable } from "./WindowsTable";
import { ModeToggle, TimeAnchorToggle, type PlanMode, type TimeAnchor } from "./ModeToggle";
import { LegDetailCard } from "./LegDetailCard";
import { EmptyState, ModePicker, Warn, RecapButton } from "./PlanStates";
import { useHasChosenMode } from "./useChosenMode";
import {
  ARCHETYPE_LABELS,
  defaultPolarConfig,
  isPolarCustomized,
  loadPolarConfig,
  savePolarConfig,
} from "../config/polarConfig";
import { rememberReturnPath } from "../config/returnPath";

// ── helpers ──────────────────────────────────────────────────────────────────

// Format a Date as "YYYY-MM-DDTHH:MM" (local, naive — the format datetime-local expects).
function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── DepartureSlider ──────────────────────────────────────────────────────────

// Open-Meteo's forecast endpoint caps start_date/end_date at ~today+15. We cap
// the slider at 14 d to leave 1 d of margin (clock skew, TZ crossings).
const SLIDER_MAX_HOURS = 14 * 24;

function DepartureSlider({
  value,
  onChange,
  resolvedTheme,
  anchor: timeAnchor = "departure",
}: {
  value: string;
  onChange: (iso: string) => void;
  resolvedTheme: "light" | "dark";
  anchor?: TimeAnchor;
}) {
  const [showManual, setShowManual] = useState(false);

  // Anchor "now" once per mount so the slider's left edge stays fixed during interaction.
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);

  const valueDate = useMemo(() => new Date(value), [value]);
  const valueHours = Math.max(
    0,
    Math.min(SLIDER_MAX_HOURS, Math.round((valueDate.getTime() - anchor.getTime()) / 3_600_000)),
  );

  function setHours(h: number) {
    const d = new Date(anchor.getTime() + h * 3_600_000);
    onChange(toLocalIso(d));
  }

  function resetToNow() {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    onChange(toLocalIso(d));
  }

  // Display labels — section header changes with the time anchor.
  const sectionLabel = timeAnchor === "arrival" ? "Arrivée" : "Départ";
  const ariaLabel = timeAnchor === "arrival" ? "Heure d'arrivée souhaitée" : "Date de départ";
  const dateLabel = valueDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = valueDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dayDelta = Math.floor((valueDate.getTime() - anchor.getTime()) / 86_400_000);
  const offsetLabel =
    dayDelta <= 0 ? "Aujourd'hui" :
    dayDelta === 1 ? "Demain" :
    `Dans ${dayDelta} jours`;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--ow-fg-2)" }}>
          {sectionLabel}
        </span>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-[10px] underline"
          style={{ color: "var(--ow-fg-2)" }}
        >
          {showManual ? "Slider" : "Ajuster"}
        </button>
      </div>

      <div className="text-sm font-semibold mb-2" style={{ color: "var(--ow-fg-0)" }}>
        <span className="capitalize">{dateLabel}</span>
        <span className="mx-1.5" style={{ color: "var(--ow-fg-2)" }}>·</span>
        <span className="tabular-nums" style={{ fontFamily: "var(--ow-font-mono)" }}>{timeLabel}</span>
        <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--ow-fg-2)" }}>{offsetLabel}</span>
      </div>

      {showManual ? (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums"
          style={{
            background: "var(--ow-bg-2)",
            color: "var(--ow-fg-0)",
            border: "1px solid var(--ow-line-2)",
            fontFamily: "var(--ow-font-mono)",
            colorScheme: resolvedTheme === "light" ? "light" : "dark",
          }}
        />
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={SLIDER_MAX_HOURS}
            step={1}
            value={valueHours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="ow-departure-slider w-full"
            aria-label={ariaLabel}
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--ow-fg-2)" }}>
            {/* Maintenant is clickable: defaulting to J+1 lets the user pick a
                horizon, but a single tap still lands them back at "now". */}
            <button
              type="button"
              onClick={resetToNow}
              className="underline-offset-2 hover:underline"
              style={{ color: dayDelta <= 0 ? "var(--ow-accent)" : "var(--ow-fg-2)" }}
            >
              Maintenant
            </button>
            <span>+1 sem.</span>
            <span>+2 sem.</span>
          </div>
        </>
      )}
    </div>
  );
}



// ModeToggle moved to ./ModeToggle so CompactDrawer can reuse it.

// ── DepartureRangeSlider ─────────────────────────────────────────────────────
// Dual-thumb slider for the compare-windows form. Two overlapping native ranges
// keyed in hours-from-now; the right thumb is constrained to stay >= 1 h after
// the left thumb. Constraints by construction = no out-of-range dates can be
// picked, replacing the error-prone datetime-local pair.

const RANGE_MAX_HOURS = 14 * 24; // mirror Open-Meteo cap (today+14d)

function DepartureRangeSlider({
  earliestHours,
  latestHours,
  onChange,
}: {
  earliestHours: number;
  latestHours: number;
  onChange: (earliest: number, latest: number) => void;
}) {
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);

  const eClamped = Math.max(0, Math.min(RANGE_MAX_HOURS - 1, earliestHours));
  const lClamped = Math.max(eClamped + 1, Math.min(RANGE_MAX_HOURS, latestHours));

  function setEarliest(h: number) {
    const next = Math.max(0, Math.min(RANGE_MAX_HOURS - 1, h));
    const newLatest = Math.max(next + 1, lClamped);
    onChange(next, Math.min(RANGE_MAX_HOURS, newLatest));
  }
  function setLatest(h: number) {
    const next = Math.min(RANGE_MAX_HOURS, Math.max(eClamped + 1, h));
    onChange(eClamped, next);
  }

  function fmt(hours: number): { date: string; time: string; offset: string } {
    const d = new Date(anchor.getTime() + hours * 3_600_000);
    return {
      date: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
      time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      offset: (() => {
        const days = Math.floor(hours / 24);
        if (days === 0) return "Aujourd'hui";
        if (days === 1) return "Demain";
        return `J+${days}`;
      })(),
    };
  }

  const eFmt = fmt(eClamped);
  const lFmt = fmt(lClamped);
  const windowHours = lClamped - eClamped;
  const windowLabel = windowHours >= 24
    ? `${(windowHours / 24).toFixed(windowHours % 24 === 0 ? 0 : 1)} j`
    : `${windowHours} h`;

  // Track fill % for visual fill between thumbs
  const fillStart = (eClamped / RANGE_MAX_HOURS) * 100;
  const fillEnd = (lClamped / RANGE_MAX_HOURS) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--ow-fg-2)" }}>
          Fenêtre de départ
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: "var(--ow-accent)" }}>
          {windowLabel}
        </span>
      </div>

      {/* Two readouts, one per thumb */}
      <div className="flex items-baseline justify-between text-xs mb-2 tabular-nums" style={{ fontFamily: "var(--ow-font-mono)" }}>
        <div>
          <div className="capitalize font-semibold" style={{ color: "var(--ow-fg-0)" }}>
            {eFmt.date} · {eFmt.time}
          </div>
          <div className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>{eFmt.offset}</div>
        </div>
        <div className="text-right">
          <div className="capitalize font-semibold" style={{ color: "var(--ow-fg-0)" }}>
            {lFmt.date} · {lFmt.time}
          </div>
          <div className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>{lFmt.offset}</div>
        </div>
      </div>

      <div className="ow-range-track">
        <div className="ow-range-track-bg" />
        <div
          className="ow-range-track-fill"
          style={{ left: `${fillStart}%`, right: `${100 - fillEnd}%` }}
        />
        <input
          type="range"
          min={0}
          max={RANGE_MAX_HOURS}
          step={1}
          value={eClamped}
          onChange={(e) => setEarliest(Number(e.target.value))}
          className="ow-range-input"
          aria-label="Départ au plus tôt"
          style={{ zIndex: eClamped > RANGE_MAX_HOURS / 2 ? 3 : 2 }}
        />
        <input
          type="range"
          min={0}
          max={RANGE_MAX_HOURS}
          step={1}
          value={lClamped}
          onChange={(e) => setLatest(Number(e.target.value))}
          className="ow-range-input"
          aria-label="Départ au plus tard"
          style={{ zIndex: eClamped > RANGE_MAX_HOURS / 2 ? 2 : 3 }}
        />
      </div>

      <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--ow-fg-2)" }}>
        <span>Maintenant</span>
        <span>+1 sem.</span>
        <span>+2 sem.</span>
      </div>
    </div>
  );
}

// ── SweepForm ─────────────────────────────────────────────────────────────────

const SWEEP_INTERVALS: { value: number; label: string }[] = [
  { value: 1, label: "Toutes les heures" },
  { value: 3, label: "Toutes les 3h" },
  { value: 6, label: "Toutes les 6h" },
];

// Match the single-mode slider cap: Open-Meteo forecast tops out at ~today+15;
// we keep 14 d to leave 1 d of margin for clock skew / TZ crossings.
const SWEEP_HORIZON_DAYS = 14;
// Backend safety cap: 14 d × 24 h = 336 windows. Mirror it here so we can
// surface a friendly hint before sending an oversize request.
const MAX_SWEEP_WINDOWS = 336;

export interface SweepValidation {
  ok: boolean;
  message?: string;
}

export function validateSweep(earliest: string, latest: string, intervalHours: number): SweepValidation {
  if (!earliest || !latest) return { ok: false, message: "Renseignez une fenêtre de départ." };
  const e = new Date(earliest);
  const l = new Date(latest);
  if (Number.isNaN(e.getTime()) || Number.isNaN(l.getTime())) {
    return { ok: false, message: "Dates invalides." };
  }
  if (l.getTime() <= e.getTime()) {
    return { ok: false, message: "Le « plus tard » doit être après le « plus tôt »." };
  }
  const horizonMs = SWEEP_HORIZON_DAYS * 86_400_000;
  const now = new Date();
  if (l.getTime() - now.getTime() > horizonMs) {
    return {
      ok: false,
      message: `La météo n'est fiable que sur ${SWEEP_HORIZON_DAYS} jours. Choisissez une date plus tôt.`,
    };
  }
  const windows = Math.floor((l.getTime() - e.getTime()) / 3_600_000 / intervalHours) + 1;
  if (windows > MAX_SWEEP_WINDOWS) {
    return {
      ok: false,
      message: `Trop de créneaux à comparer (${windows}). Réduisez la fenêtre ou augmentez le pas.`,
    };
  }
  return { ok: true };
}

// Minimal "YYYY-MM-DDTHH:MM" formatter from a Date (local time).
function toLocalIsoMin(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SweepForm({
  earliest,
  latest,
  intervalHours,
  onEarliestChange,
  onLatestChange,
  onIntervalChange,
}: {
  earliest: string;
  latest: string;
  intervalHours: number;
  onEarliestChange: (iso: string) => void;
  onLatestChange: (iso: string) => void;
  onIntervalChange: (h: number) => void;
}) {
  // Convert ISO local strings <-> hours-from-now so the slider can drive them.
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);
  function isoToHours(iso: string): number {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.round((t - anchor.getTime()) / 3_600_000);
  }
  function hoursToIso(h: number): string {
    return toLocalIsoMin(new Date(anchor.getTime() + h * 3_600_000));
  }

  const earliestHours = Math.max(0, isoToHours(earliest));
  const latestHours = Math.max(earliestHours + 1, isoToHours(latest));

  const validation = validateSweep(earliest, latest, intervalHours);

  return (
    <div className="space-y-3">
      <DepartureRangeSlider
        earliestHours={earliestHours}
        latestHours={latestHours}
        onChange={(e, l) => {
          onEarliestChange(hoursToIso(e));
          onLatestChange(hoursToIso(l));
        }}
      />
      {!validation.ok && validation.message && (
        <p className="text-[11px]" style={{ color: "var(--ow-warn)" }}>
          {validation.message}
        </p>
      )}

      <div>
        <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--ow-fg-2)" }}>
          Pas d'échantillonnage
        </label>
        <div className="flex gap-1.5">
          {SWEEP_INTERVALS.map(({ value, label }) => {
            const active = intervalHours === value;
            return (
              <button
                key={value}
                onClick={() => onIntervalChange(value)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: active ? "var(--ow-accent-soft)" : "var(--ow-bg-2)",
                  color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
                  border: `1px solid ${active ? "var(--ow-accent)" : "var(--ow-line-2)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── ArchetypeSelector ─────────────────────────────────────────────────────────

function ArchetypeSelector({
  currentSlug,
  archetypes,
  onChange,
  onCustomCleared,
}: {
  currentSlug: string;
  archetypes: Archetype[];
  onChange: (slug: string) => void;
  // Notify the parent that the custom polar was reset so it can re-fetch
  // (the new fingerprint won't match the cached one, and resolveOverrides
  // will stop sending the custom matrix).
  onCustomCleared?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Re-read the polar config every render. Cheap (localStorage parse + a few
  // boolean checks) and ensures the "Custom" pill appears immediately after
  // the user edits /config in another tab and comes back here.
  const polarCfg = loadPolarConfig();
  const isCustom = isPolarCustomized(polarCfg, currentSlug);
  const baseLabel = ARCHETYPE_LABELS[polarCfg.base] ?? polarCfg.base;
  const current = archetypes.find((a) => a.slug === currentSlug);
  const archetypeLabel = current?.name ?? currentSlug;
  const label = isCustom ? "Custom" : archetypeLabel;

  function resetCustom() {
    savePolarConfig(defaultPolarConfig());
    setOpen(false);
    onCustomCleared?.();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: isCustom ? "var(--ow-accent)" : "var(--ow-fg-1)" }}
        title={isCustom ? `Polaire personnalisée active (base : ${baseLabel})` : "Changer le type de bateau"}
      >
        {label}
        {isCustom && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded"
            style={{ background: "var(--ow-accent-soft)", color: "var(--ow-accent)" }}
          >
            perso
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-7 z-20 min-w-[240px] rounded-xl shadow-xl border overflow-hidden"
            style={{ background: "var(--ow-bg-1)", borderColor: "var(--ow-line-2)", boxShadow: "var(--ow-shadow-pop)" }}
          >
            {isCustom && (
              <div
                className="px-4 py-3 text-xs"
                style={{
                  background: "var(--ow-accent-soft)",
                  color: "var(--ow-accent)",
                  borderBottom: "1px solid var(--ow-line)",
                }}
              >
                <div className="font-semibold mb-1">Polaire personnalisée active</div>
                <div className="opacity-80 mb-2">Base : {baseLabel}</div>
                <div className="flex gap-2">
                  <a
                    href="/config"
                    onClick={rememberReturnPath}
                    className="underline"
                    style={{ color: "var(--ow-accent)" }}
                  >
                    éditer
                  </a>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <button
                    type="button"
                    onClick={resetCustom}
                    className="underline"
                    style={{ color: "var(--ow-accent)" }}
                  >
                    réinitialiser
                  </button>
                </div>
              </div>
            )}
            {archetypes.map((a) => (
              <button
                key={a.slug}
                onClick={() => { onChange(a.slug); setOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm transition-colors"
                style={{
                  background: !isCustom && a.slug === currentSlug ? "var(--ow-accent-soft)" : "transparent",
                  color: !isCustom && a.slug === currentSlug ? "var(--ow-accent)" : "var(--ow-fg-0)",
                  borderBottom: "1px solid var(--ow-line)",
                }}
              >
                <div className="font-semibold">{a.name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ow-fg-2)" }}>
                  {a.length_ft} ft · {a.type} · {a.examples[0]}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── LegList ──────────────────────────────────────────────────────────────────
// Click-to-expand list of legs. Collapsed = single natural-language summary
// line ("Tronçon 1 : 45 mn au près avec mer formée"). Expanded = a 4-block KPI
// grid (vent / mer / distance / temps) above the existing compass-and-build-up
// LegDetailCard so the user can scan or drill.

function fmtHM(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function SummaryCell({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span
      className="text-xs whitespace-normal"
      style={{ color: "var(--ow-fg-1)", lineHeight: 1.15, display: "inline-block" }}
    >
      {value}
    </span>
  );
}

function KpiBlock({
  value,
  label,
  tone,
}: {
  value: string;
  label?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className="rounded-md border px-2 py-1"
      style={{
        background: tone === "warn"
          ? "color-mix(in srgb, var(--ow-warn, #fbbf24) 14%, transparent)"
          : "var(--ow-bg-1)",
        borderColor: tone === "warn"
          ? "color-mix(in srgb, var(--ow-warn, #fbbf24) 38%, transparent)"
          : "var(--ow-line)",
      }}
    >
      <div
        className="text-[11px] font-semibold tabular-nums leading-tight break-words"
        style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}
      >
        {value}
      </div>
      {label && (
        <div
          className="text-[9px] uppercase tracking-wider leading-tight mt-0.5 break-words"
          style={{ color: "var(--ow-fg-2)" }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function LegRow({
  leg,
  index,
  expanded,
  onToggle,
}: {
  leg: AggregatedLeg;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cx = cxLevel((leg.tws_min + leg.tws_max) / 2);
  const summary = buildLegSummaryCells(leg);

  // KPI values shown on expand. Wind + allure are intentionally absent —
  // the collapsed row already carries them, no point repeating.
  // Compact French formatting: "1,8m (6s)" matches sailing-French copy.
  const fr1 = (n: number) => n.toFixed(1).replace(".", ",");

  const seaValue = leg.hs_avg_m == null
    ? "—"
    : leg.tp_avg_s != null
      ? `${fr1(leg.hs_avg_m)}m (${leg.tp_avg_s.toFixed(0)}s)`
      : `${fr1(leg.hs_avg_m)}m`;
  const seaLabel = leg.hs_avg_m == null
    ? "mer non observée"
    : leg.sea_direction === "face"
      ? "de face"
      : leg.sea_direction === "travers"
        ? "de travers"
        : "par l'arrière";

  // Warn tint when sea state notable. Mirrors the same Hs threshold the
  // summary line uses, so "Mer Formée" badge and warn-coloured KPI agree.
  const seaWarn = leg.hs_avg_m != null && leg.hs_avg_m > 1.25;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  const rowBg = expanded ? "var(--ow-bg-2)" : "transparent";

  // Each leg returns three `<tr>`s into the shared `<table>` in LegList:
  // a title row (badge + name + speed + chevron), a chip row (the four
  // summary cells), and an optional expand row (KPIs + LegDetailCard).
  // Because they're all in the same table, the colgroup defined in LegList
  // forces every leg's chip cells to live in the same column widths —
  // exactly the cross-row alignment a tableless flex/grid layout couldn't
  // give us when each LegRow had its own grid container.
  return (
    <>
      {/* Single-row leg: badge + 4 info cells + chevron. The speed
          indicator was dropped and the redundant "Tronçon X" label was
          dropped earlier — the numbered badge identifies the leg. */}
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={handleKey}
        className="cursor-pointer"
        style={{ background: rowBg }}
      >
        <td className="py-2 pl-3 pr-2 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          {/* Leg label is "from→to" using user-waypoint indices (1-based).
              `index` here is 0-based across legs, so leg N goes from
              waypoint N to waypoint N+1. Distance sits under the badge so
              the user can scan leg length without expanding. */}
          <div className="flex flex-col items-start gap-0.5">
            <span
              className="inline-flex h-6 px-1.5 rounded-md items-center justify-center text-[10px] font-bold tabular-nums whitespace-nowrap"
              style={{ background: CX_COLORS[cx], color: "#0B1D14", fontFamily: "var(--ow-font-mono)" }}
            >
              {index + 1}→{index + 2}
            </span>
            <span
              className="text-[10px] tabular-nums whitespace-nowrap"
              style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
            >
              {fr1(leg.distance_nm)} nm
            </span>
          </div>
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.duration} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.allure} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.wind} />
        </td>
        <td className="py-2 px-1 align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <SummaryCell value={summary.flag} />
        </td>
        <td className="py-2 pl-1 pr-3 text-right align-middle" style={{ borderTop: "1px solid var(--ow-line)" }}>
          <span
            aria-hidden="true"
            className="inline-flex"
            style={{
              color: expanded ? "var(--ow-accent)" : "var(--ow-fg-3)",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease, color 150ms ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l5 5 5-5" />
            </svg>
          </span>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: rowBg }}>
          <td colSpan={6} className="px-4 pb-3">
            {/* Two KPI cells (time / sea). Wind, allure and distance all
                appear in the collapsed row above; repeating them in the
                expand was visual noise. */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <KpiBlock value={`${fmtHM(leg.start_time)} → ${fmtHM(leg.end_time)}`} label="dep → arr" />
              <KpiBlock value={seaValue} label={seaLabel} tone={seaWarn ? "warn" : "default"} />
            </div>
            <LegDetailCard leg={leg} />
          </td>
        </tr>
      )}
    </>
  );
}

function LegList({
  legs,
  openIdx,
  onOpenChange,
}: {
  legs: AggregatedLeg[];
  openIdx: number | null;
  onOpenChange: (idx: number | null) => void;
}) {
  return (
    <div>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr
            className="text-[9px] uppercase tracking-widest"
            style={{ color: "var(--ow-fg-3)" }}
          >
            <th className="py-1 pl-3 pr-2 pt-3 text-left font-semibold">Tronçon</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Durée</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Allure</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Vent (kn)</th>
            <th className="py-1 px-1 pt-3 text-left font-semibold">Mer</th>
            <th className="py-1 pl-1 pr-3 pt-3" />
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => (
            <LegRow
              key={i}
              leg={leg}
              index={i}
              expanded={openIdx === i}
              onToggle={() => onOpenChange(openIdx === i ? null : i)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── PlanSidebar ───────────────────────────────────────────────────────────────

interface PlanSidebarProps {
  passage: PassageReport | null;
  complexity: ComplexityScore | null;
  isLoading: boolean;
  error: string | null;
  archetypes: Archetype[];
  currentArchetypeSlug: string;
  onArchetypeChange: (slug: string) => void;
  departure: string;
  onDepartureChange: (iso: string) => void;
  isStale: boolean;
  onRefetch: () => void;
  forecastUpdatedAt: string | null;
  waypointCount: number;
  waypoints: [number, number][];
  // ETA-driven sub-mode for "Simuler ma route".
  timeAnchor: TimeAnchor;
  onTimeAnchorChange: (a: TimeAnchor) => void;
  // Compare-windows mode (lifted from local state in step 2)
  mode: PlanMode;
  onModeChange: (m: PlanMode) => void;
  sweepEarliest: string;
  sweepLatest: string;
  sweepIntervalHours: number;
  onSweepEarliestChange: (iso: string) => void;
  onSweepLatestChange: (iso: string) => void;
  onSweepIntervalChange: (h: number) => void;
  windows: PassageWindow[] | null;
  metaWarnings: string[];
  onCompareFetch: () => void;
  onWindowSelect?: (w: PassageWindow) => void;
  /** Selected leg index in the filled view (drives the map highlight). */
  selectedLegIdx: number | null;
  onSelectedLegChange: (idx: number | null) => void;
  /** Mobile-only: pop the bottom drawer up to a readable height when the
   *  user picks a mode (no-op on desktop). */
  onExpandDrawer?: () => void;
  /** Discard the current plan: clears waypoints, results, cache, URL. */
  onReset?: () => void;
}

// Header row: ModeToggle + an optional trash button to discard the plan.
// The trash sits flush with the toggle and only renders when a route exists
// (no waypoints → nothing to reset). Tooltip: "Réinitialiser".
function PlanHeaderRow({
  mode,
  onModeChange,
  locked,
  onReset,
}: {
  mode: PlanMode;
  onModeChange: (m: PlanMode) => void;
  locked?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0">
        <ModeToggle value={mode} onChange={onModeChange} locked={locked} />
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Nouveau plan"
          aria-label="Nouveau plan"
          className="shrink-0 flex items-center justify-center rounded-lg transition-colors hover:opacity-100"
          style={{
            width: 38,
            background: "var(--ow-bg-2)",
            border: "1px solid var(--ow-line)",
            color: "var(--ow-fg-2)",
            opacity: 0.85,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4h11" />
            <path d="M6 4V2.5h4V4" />
            <path d="M3.5 4l.9 9.2a1 1 0 0 0 1 .8h5.2a1 1 0 0 0 1-.8L12.5 4" />
            <path d="M6.5 6.5v5" />
            <path d="M9.5 6.5v5" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function PlanSidebar({
  passage,
  complexity,
  isLoading,
  error,
  archetypes,
  currentArchetypeSlug,
  onArchetypeChange,
  departure,
  onDepartureChange,
  isStale,
  onRefetch,
  forecastUpdatedAt,
  waypointCount,
  waypoints,
  timeAnchor,
  onTimeAnchorChange,
  mode,
  onModeChange,
  sweepEarliest,
  sweepLatest,
  sweepIntervalHours,
  onSweepEarliestChange,
  onSweepLatestChange,
  onSweepIntervalChange,
  windows,
  metaWarnings,
  onCompareFetch,
  onWindowSelect,
  selectedLegIdx,
  onSelectedLegChange,
  onExpandDrawer,
  onReset,
}: PlanSidebarProps) {
  // Show the trash button only when the user has placed enough to have
  // something to clear — nothing to reset on a fully-empty form.
  const resetHandler = onReset && waypointCount >= 2 ? onReset : undefined;
  const { resolvedTheme } = useTheme();
  const sweepValid = mode === "compare"
    ? validateSweep(sweepEarliest, sweepLatest, sweepIntervalHours)
    : { ok: true } as SweepValidation;
  const canCalculate = waypointCount >= 2 && (mode === "single" || sweepValid.ok);
  const [hasChosenMode, markChosen] = useHasChosenMode();
  const [isEditingParams, setIsEditingParams] = useState(false);

  // Wrap the parent handler so picking via tabs ALSO dismisses the picker on
  // future visits. Same effect when the user clicks one of the big cards.
  const handleModeChange = (m: PlanMode) => {
    markChosen();
    onModeChange(m);
  };

  // Show the mode picker when: 2+ waypoints placed, user has never chosen a
  // mode in this browser, and no result is showing yet (single passage or
  // compare windows). After first choice it gets out of the way for good.
  const showModePicker =
    waypointCount >= 2 && !hasChosenMode && !passage && !(windows && windows.length > 0);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-5 w-32 rounded" />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
        <div className="skeleton h-2.5 rounded-full" />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <PlanHeaderRow mode={mode} onModeChange={handleModeChange} locked={waypointCount < 2} onReset={resetHandler} />
        <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--ow-err-soft)", color: "var(--ow-err)", border: "1px solid var(--ow-err-line)" }}>
          <p className="font-semibold mb-1">Erreur</p>
          <p className="leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // ── Empty state: no waypoints yet ─────────────────────────────────────────
  if (waypointCount < 2) {
    return (
      <div className="p-4 animate-fade-in">
        <PlanHeaderRow mode={mode} onModeChange={handleModeChange} locked />
        <EmptyState />
      </div>
    );
  }

  // ── Mode picker: 2+ waypoints, no choice yet ──────────────────────────────
  if (showModePicker) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <PlanHeaderRow mode={mode} onModeChange={handleModeChange} locked onReset={resetHandler} />
        <ModePicker
          onPick={(m) => {
            handleModeChange(m);
            onExpandDrawer?.();
          }}
        />
      </div>
    );
  }

  const archetype = archetypes.find((a) => a.slug === currentArchetypeSlug);
  const archetypeLabel = archetype?.name ?? currentArchetypeSlug;

  // ── Filled compare view: results loaded, inputs collapsed into a recap ────
  if (mode === "compare" && windows && windows.length > 0) {
    const fmtShort = (iso: string) =>
      new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    const fmtClock = (iso: string) =>
      new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const recapPrimary = `${fmtShort(sweepEarliest)} ${fmtClock(sweepEarliest)} → ${fmtShort(sweepLatest)} ${fmtClock(sweepLatest)}`;
    const recapSecondary = `pas ${sweepIntervalHours}h · ${archetypeLabel}`;

    return (
      <div className="animate-fade-in">
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          <PlanHeaderRow mode={mode} onModeChange={handleModeChange} onReset={resetHandler} />
        </div>

        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          <button
            onClick={onCompareFetch}
            disabled={!canCalculate}
            className="w-full flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all"
            style={{
              background: canCalculate ? "#F4C25C" : "var(--ow-bg-2)",
              color: canCalculate ? "#3a2a08" : "var(--ow-fg-3)",
              border: `1px solid ${canCalculate ? "transparent" : "var(--ow-line)"}`,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 2.5A7 7 0 1 0 14.5 9" /><path d="M14 1v4h-4" />
            </svg>
            Recalculer
          </button>
        </div>

        <RecapButton
          primary={recapPrimary}
          secondary={recapSecondary}
          isOpen={isEditingParams}
          onClick={() => setIsEditingParams((v) => !v)}
        />
        {isEditingParams && (
          <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--ow-line)", background: "var(--ow-bg-2)" }}>
            <SweepForm
              earliest={sweepEarliest}
              latest={sweepLatest}
              intervalHours={sweepIntervalHours}
              onEarliestChange={onSweepEarliestChange}
              onLatestChange={onSweepLatestChange}
              onIntervalChange={onSweepIntervalChange}
            />
            <ArchetypeSelector
              currentSlug={currentArchetypeSlug}
              archetypes={archetypes}
              onChange={onArchetypeChange}
              onCustomCleared={onRefetch}
            />
          </div>
        )}

        {metaWarnings.length > 0 && (
          <div className="px-4 py-2.5 space-y-1.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
            {metaWarnings.map((m, i) => <Warn key={i}>{m}</Warn>)}
          </div>
        )}

        <WindowsTable windows={windows} onSelect={onWindowSelect} />

        <p className="px-4 py-2 text-[10px]" style={{ color: "var(--ow-fg-3)", borderTop: "1px solid var(--ow-line)" }}>
          {windows.length} fenêtre{windows.length > 1 ? "s" : ""} comparée{windows.length > 1 ? "s" : ""} · cliquez sur une ligne pour ouvrir la simulation détaillée
        </p>
      </div>
    );
  }

  // ── Form state (compare without windows; single before any result) ────────
  if (mode === "compare" || !passage || !complexity) {
    const accent = mode === "compare" ? "#F4C25C" : "var(--ow-accent)";
    const ctaInk = mode === "compare" ? "#3a2a08" : "#fff";
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <PlanHeaderRow mode={mode} onModeChange={handleModeChange} onReset={resetHandler} />

        {mode === "single" ? (
          <div className="space-y-2">
            <TimeAnchorToggle value={timeAnchor} onChange={onTimeAnchorChange} />
            <DepartureSlider
              value={departure}
              onChange={onDepartureChange}
              resolvedTheme={resolvedTheme}
              anchor={timeAnchor}
            />
          </div>
        ) : (
          <SweepForm
            earliest={sweepEarliest}
            latest={sweepLatest}
            intervalHours={sweepIntervalHours}
            onEarliestChange={onSweepEarliestChange}
            onLatestChange={onSweepLatestChange}
            onIntervalChange={onSweepIntervalChange}
          />
        )}

        <ArchetypeSelector
          currentSlug={currentArchetypeSlug}
          archetypes={archetypes}
          onChange={onArchetypeChange}
          onCustomCleared={onRefetch}
        />

        <button
          onClick={mode === "single" ? onRefetch : onCompareFetch}
          disabled={!canCalculate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: canCalculate ? accent : "var(--ow-bg-2)",
            color: canCalculate ? ctaInk : "var(--ow-fg-3)",
            border: `1px solid ${canCalculate ? "transparent" : "var(--ow-line-2)"}`,
            cursor: canCalculate ? "pointer" : "not-allowed",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 2.5A7 7 0 1 0 14.5 9"/><path d="M14 1v4h-4"/>
          </svg>
          {canCalculate
            ? mode === "single" ? "Calculer le passage" : "Comparer les créneaux"
            : `${waypointCount}/2 waypoints`}
        </button>
      </div>
    );
  }

  // ── Filled state: single mode with a result ───────────────────────────────
  const hasWarnings = (complexity.warnings?.length ?? 0) > 0 || passage.warnings.length > 0;
  const recapDate = new Date(departure).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const recapTime = new Date(departure).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="animate-fade-in">
      {/* Mode tabs */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--ow-line)" }}>
        <PlanHeaderRow mode={mode} onModeChange={handleModeChange} onReset={resetHandler} />
      </div>

      {/* Recalculer bar */}
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
        <button
          onClick={onRefetch}
          className="w-full flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-semibold transition-all"
          style={{
            background: isStale ? "var(--ow-accent)" : "var(--ow-bg-2)",
            color: isStale ? "#fff" : "var(--ow-fg-1)",
            border: `1px solid ${isStale ? "transparent" : "var(--ow-line)"}`,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 2.5A7 7 0 1 0 14.5 9" /><path d="M14 1v4h-4" />
          </svg>
          {isStale ? "Recalculer" : "Recalculer"}
        </button>
      </div>

      {/* Récap compact: click to edit departure / archetype inline */}
      <RecapButton
        primary={`${recapDate.charAt(0).toUpperCase() + recapDate.slice(1)} · ${recapTime}`}
        secondary={archetypeLabel}
        isOpen={isEditingParams}
        onClick={() => setIsEditingParams((v) => !v)}
      />
      {isEditingParams && (
        <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid var(--ow-line)", background: "var(--ow-bg-2)" }}>
          <TimeAnchorToggle value={timeAnchor} onChange={onTimeAnchorChange} />
          <DepartureSlider
            value={departure}
            onChange={onDepartureChange}
            resolvedTheme={resolvedTheme}
            anchor={timeAnchor}
          />
          <ArchetypeSelector
            currentSlug={currentArchetypeSlug}
            archetypes={archetypes}
            onChange={onArchetypeChange}
            onCustomCleared={onRefetch}
          />
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="px-4 py-2.5 space-y-1.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
          {complexity.warnings?.map((w, i) => <Warn key={i}>{w.message}</Warn>)}
          {passage.warnings.map((w, i) => <Warn key={`pw-${i}`}>{w}</Warn>)}
        </div>
      )}

      {/* Legs — click any row to see the build-up */}
      {(() => {
        const legs = aggregateLegs(passage.segments, waypoints, passage.efficiency);
        return (
          <LegList
            legs={legs}
            openIdx={selectedLegIdx}
            onOpenChange={onSelectedLegChange}
          />
        );
      })()}

      {/* Footer */}
      {forecastUpdatedAt && (
        <p className="px-4 py-2 text-[10px]" style={{ color: "var(--ow-fg-2)", borderTop: "1px solid var(--ow-line)" }}>
          Données fraîches au {new Date(forecastUpdatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · Open-Meteo.com (CC BY 4.0)
        </p>
      )}
    </div>
  );
}
