// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The card under an open leg: one dial, one column of numbers, and a header
 * that says which slice of the leg they describe.
 *
 * The same card shows the leg average and any one of its steps: both are an
 * `AggregatedLeg` (see `aggregateSteps`), so the reader compares like with
 * like when stepping through. What differs is only what the parent hands in:
 * the average comes with a `spread` (ranges and direction arcs, what the
 * mean hides), a step comes with its raw values and its own flags.
 *
 * Everything is presentational. The choice of slice, and the arrows' wiring,
 * live in `sidebar/LegExpanded.tsx`.
 */

import type { AggregatedLeg, LegSpread } from "./aggregateLegs";
import { ConditionsCompass } from "./ConditionsCompass";
import { FORCE_COLORS } from "./forceColors";
import { fr1 } from "./format";
import { CURRENT_RELEVANCE_THRESHOLD_KN } from "../domain/thresholds";

/** Rendered size of the dial. Leaves about 160 px for the numbers on a
    360 px phone once the panel's and the card's paddings are taken out. */
const COMPASS_PX = 140;

// Waves track wind in our Med model; the wave marker is offset by a fixed
// 30° so the two glyphs never share a shaft, on the side away from the bow.
const WAVE_OFFSET_DEG = 30;

export interface LegDetailHeader {
  /** "Moyenne · 22 mn" or "16:13 → 16:17". */
  title: string;
  /** "4 mn · 0,14 nm · 4/6". */
  sub?: string;
  /** "touchez un pas", the quietest text on the card. */
  hint?: string;
}

export interface LegDetailNote {
  text: string;
  tone: "muted" | "waves" | "current";
}

function fmtSigned1(n: number): string {
  if (Math.abs(n) < 0.05) return "+0,0";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${fr1(Math.abs(n))}`;
}

function fmtRange1(range: [number, number], unit: string): string {
  const [lo, hi] = range;
  return fr1(lo) === fr1(hi) ? `${fr1(hi)} ${unit}` : `${fr1(lo)}–${fr1(hi)} ${unit}`;
}

/** Width of the label column, shared by the table and the speed line. */
const LABEL_PX = 56;

// One row of the table. The label carries the colour of the force's glyph
// on the rose, which is what lets the reader match a band or an arrow to a
// line without any writing on the dial.
function TableRow({
  label,
  color,
  muted = false,
  plain = false,
  children,
}: {
  label: string;
  color: string;
  /** Data absent or negligible: the value fades. */
  muted?: boolean;
  /** Not a force: the value in regular weight and neutral colour. */
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td className="pr-2 align-baseline font-semibold" style={{ color, width: LABEL_PX, paddingTop: 1, paddingBottom: 1 }}>
        {label}
      </td>
      <td
        className={plain || muted ? "font-normal" : "font-semibold"}
        style={{ color: muted ? "var(--ow-fg-3)" : plain ? "var(--ow-fg-1)" : color, paddingTop: 1, paddingBottom: 1 }}
      >
        {children}
      </td>
    </tr>
  );
}

function NavButton({
  dir,
  onClick,
}: {
  dir: "prev" | "next";
  onClick: (() => void) | null;
}) {
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Pas précédent" : "Pas suivant"}
      onClick={onClick ?? undefined}
      disabled={onClick === null}
      className="shrink-0 inline-flex items-center justify-center rounded-md"
      style={{
        width: 32,
        height: 32,
        color: onClick ? "var(--ow-fg-1)" : "var(--ow-fg-3)",
        opacity: onClick ? 1 : 0.5,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir === "prev" ? <path d="M10 3L5 8l5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  );
}

export function LegDetailCard({
  view,
  spread,
  header,
  onPrev,
  onNext,
  notes,
}: {
  view: AggregatedLeg;
  /** Ranges and arcs across the steps: set for the average, null for a step. */
  spread: LegSpread | null;
  header: LegDetailHeader;
  /** Null renders the arrow disabled; both null and there are no arrows at
      all (a leg with a single step has nothing to walk). */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  notes: LegDetailNote[];
}) {
  const mono = { fontFamily: "var(--ow-font-mono)" } as const;
  const hasWaves = view.hs_avg_m != null;
  // Below the relevance threshold the current is noise, not information:
  // neither the dial nor the numbers mention it, same rule as the leg row.
  // For the average `current_speed_kn` is the max over the steps, so a leg
  // shows its current as soon as one step carries a real one. A current that
  // still moves the speed by a tenth of a knot stays on screen too, so the
  // build-up never shows a "courant" row the dial does not explain.
  const currentDelta = view.current_delta_kn != null && Math.abs(view.current_delta_kn) > 0.05;
  const hasCurrent =
    view.current_speed_kn != null &&
    (view.current_speed_kn >= CURRENT_RELEVANCE_THRESHOLD_KN || currentDelta);

  // ── The rows of the table, each value in its glyph's colour ──────────────
  const tws = Math.round(view.tws_avg_kn);
  const twsMin = Math.round(view.tws_min);
  const twsMax = Math.round(view.tws_max);
  const gust = view.gust_max_kn != null && view.gust_max_kn > twsMax + 1 ? ` (${Math.round(view.gust_max_kn)})` : "";
  const windText = spread && twsMin !== twsMax ? `${twsMin}–${twsMax}${gust} kn` : `${tws}${gust} kn`;

  let seaText: string | null = null;
  if (hasWaves) {
    seaText = spread?.hs_range
      ? fmtRange1(spread.hs_range, "m")
      : `${fr1(view.hs_avg_m as number)} m${view.tp_avg_s != null ? ` · ${Math.round(view.tp_avg_s)} s` : ""}`;
  }

  // The current row: its range on the average, its value and its sense on
  // a step. Data under the threshold still gets a row, so the table keeps
  // its shape and the reader learns the current was looked at.
  const relative =
    view.current_relative === "portant" ? "portant" :
    view.current_relative === "contraire" ? "contraire" :
    view.current_relative === "travers" ? "de travers" : "";
  let currentText: string | null = null;
  let currentMuted = false;
  if (view.current_speed_kn != null) {
    if (!hasCurrent) {
      currentText = `< ${fr1(CURRENT_RELEVANCE_THRESHOLD_KN)} kn`;
      currentMuted = true;
    } else if (spread?.current_speed_range) {
      currentText = fmtRange1(spread.current_speed_range, "kn");
    } else {
      currentText = `${fr1(view.current_speed_kn)} kn${relative ? ` ${relative}` : ""}`;
    }
  }

  const capText = `${Math.round(view.bearing_avg_deg)}° · ${view.point_of_sail}`;

  const showNav = onPrev !== null || onNext !== null;

  const noteColor = (tone: LegDetailNote["tone"]): string =>
    tone === "waves" ? FORCE_COLORS.waves : tone === "current" ? FORCE_COLORS.current : "var(--ow-fg-2)";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--ow-bg-1)", border: "1px solid var(--ow-line)" }}
    >
      {/* Header: which slice, with the arrows that walk the steps. */}
      <div
        className="flex items-center gap-1 px-1"
        style={{ borderBottom: "1px solid var(--ow-line)", paddingTop: showNav ? 4 : 8, paddingBottom: showNav ? 4 : 8 }}
      >
        {showNav && <NavButton dir="prev" onClick={onPrev} />}
        <div className="flex-1 min-w-0 text-center leading-tight">
          <span className="text-xs font-semibold tabular-nums" style={{ ...mono, color: "var(--ow-fg-0)" }}>
            {header.title}
          </span>
          {header.sub && (
            <span className="ml-1.5 text-[10px] tabular-nums whitespace-nowrap" style={{ ...mono, color: "var(--ow-fg-2)" }}>
              {header.sub}
            </span>
          )}
          {header.hint && (
            <span className="ml-1.5 text-[10px] whitespace-nowrap" style={{ color: "var(--ow-fg-3)" }}>
              {header.hint}
            </span>
          )}
        </div>
        {showNav && <NavButton dir="next" onClick={onNext} />}
      </div>

      {/* Body: dial on the left, numbers on the right. */}
      <div className="flex items-center gap-2 px-2 py-2.5">
        <ConditionsCompass
          size={COMPASS_PX}
          variant={spread ? "average" : "step"}
          bearingDeg={view.bearing_avg_deg}
          windDeg={view.twd_avg_deg}
          waveDeg={hasWaves ? view.twd_avg_deg + WAVE_OFFSET_DEG : null}
          currentDeg={hasCurrent ? view.current_direction_to_deg : null}
          windArc={spread?.twd_arc ?? null}
          currentArc={hasCurrent ? spread?.current_arc ?? null : null}
          ariaLabel="Vent, vagues et courant autour du bateau, Nord en haut"
        />

        <div className="flex-1 min-w-0 tabular-nums leading-snug" style={mono}>
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <TableRow label="Vent" color={FORCE_COLORS.wind}>{windText}</TableRow>
              <TableRow label="Mer" color={FORCE_COLORS.waves} muted={!seaText}>
                {seaText ?? "non observée"}
              </TableRow>
              {currentText && (
                <TableRow label="Courant" color={FORCE_COLORS.current} muted={currentMuted}>
                  {currentText}
                </TableRow>
              )}
              {/* The boat's own colour: the dot on the hull, and the speed. */}
              <TableRow label="Cap" color="var(--ow-accent)" plain>{capText}</TableRow>
            </tbody>
          </table>

          {/* The over-ground speed and, on a step, how it adds up: the first
              term has no sign, the line reads as the sum it is. Not on the
              average: a mean of sums misled more than it explained, the
              note below sends the reader to the steps instead. */}
          <div
            className="mt-1.5 pt-1.5 flex items-baseline gap-2"
            style={{ borderTop: "1px solid var(--ow-line)" }}
          >
            <span className="shrink-0 text-[11px]" style={{ color: "var(--ow-fg-2)", width: LABEL_PX }}>
              Vitesse
            </span>
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--ow-accent)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {fr1(view.target_speed_kn)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>kn abs.</span>
          </div>
          {!spread && (
            <div className="mt-1 text-[10px] flex flex-wrap gap-x-1.5" style={{ paddingLeft: LABEL_PX + 8 }}>
              <span style={{ color: FORCE_COLORS.wind }}>{fr1(view.polar_after_eff_kn)} polaire</span>
              {hasWaves && Math.abs(view.wave_delta_kn) > 0.05 && (
                <span style={{ color: FORCE_COLORS.waves }}>{fmtSigned1(view.wave_delta_kn)} mer</span>
              )}
              {currentDelta && (
                <span style={{ color: FORCE_COLORS.current }}>{fmtSigned1(view.current_delta_kn ?? 0)} courant</span>
              )}
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-1.5 text-[10px] leading-snug" style={{ paddingLeft: LABEL_PX + 8 }}>
              {notes.map((n) => (
                <div key={n.text} style={{ color: noteColor(n.tone) }}>
                  {n.tone === "muted" ? n.text : `⚠ ${n.text}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
