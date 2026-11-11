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
 * Under the table of the steps the card is `compact`: the table says the
 * wind, the sea and the current of every step already, so the card keeps
 * only what it alone says: the dial, the time and distance of the slice,
 * the heading and point of sail, the speed over ground and how it adds up.
 * A leg of a single step has no table, and its card keeps every row.
 *
 * Everything is presentational. The choice of slice lives in
 * `sidebar/LegExpanded.tsx`, and the table of the steps is how it is made.
 */

import type { AggregatedLeg, LegSpread } from "./aggregateLegs";
import { ConditionsCompass } from "./ConditionsCompass";
import { FORCE_COLORS } from "./forceColors";
import { num1 } from "./format";
import { CURRENT_RELEVANCE_THRESHOLD_KN } from "../domain/thresholds";
import { useT } from "../i18n";

/** Rendered size of the dial. Leaves about 160 px for the numbers on a
    360 px phone once the panel's and the card's paddings are taken out.
    Smaller in the compact card, which has fewer lines beside it. */
const COMPASS_PX = 140;
const COMPASS_COMPACT_PX = 104;

// Waves track wind in our Med model; the wave marker is offset by a fixed
// 30° so the two glyphs never share a shaft, on the side away from the bow.
const WAVE_OFFSET_DEG = 30;

export interface LegDetailHeader {
  /** "Tout le tronçon · 4h40" or "16:13 → 16:17". */
  title: string;
  /** "moyenne de 5 pas" or "4 mn · 0,14 nm", quieter. */
  sub?: string;
}

export interface LegDetailNote {
  text: string;
  tone: "muted" | "waves" | "current";
}

function fmtSigned1(n: number): string {
  if (Math.abs(n) < 0.05) return `+${num1(0)}`;
  const sign = n > 0 ? "+" : "−";
  return `${sign}${num1(Math.abs(n))}`;
}

function fmtRange1(range: [number, number], unit: string): string {
  const [lo, hi] = range;
  return num1(lo) === num1(hi) ? `${num1(hi)} ${unit}` : `${num1(lo)}–${num1(hi)} ${unit}`;
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

export function LegDetailCard({
  view,
  spread,
  header,
  notes,
  compact = false,
}: {
  view: AggregatedLeg;
  /** Ranges and arcs across the steps: set for the average, null for a step. */
  spread: LegSpread | null;
  header: LegDetailHeader;
  notes: LegDetailNote[];
  /** The table of the steps is above: no wind, sea or current rows here. */
  compact?: boolean;
}) {
  const { t } = useT();
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
      : `${num1(view.hs_avg_m as number)} m${view.tp_avg_s != null ? ` · ${Math.round(view.tp_avg_s)} s` : ""}`;
  }

  // The current row: its range on the average, its value and its sense on
  // a step. Data under the threshold still gets a row, so the table keeps
  // its shape and the reader learns the current was looked at. One whole key
  // per sense rather than a knot value with a word stuck to it: the
  // qualifier does not sit after the figure in every language.
  const currentKey =
    view.current_relative === "portant" ? "panel.legDetail.currentFair" :
    view.current_relative === "contraire" ? "panel.legDetail.currentFoul" :
    view.current_relative === "travers" ? "panel.legDetail.currentAcross" :
    "panel.legDetail.currentPlain";
  let currentText: string | null = null;
  let currentMuted = false;
  if (view.current_speed_kn == null && view.current_unknown) {
    // Withheld by the server, not missing: say so, the notice says where.
    currentText = t("panel.legDetail.currentUnknown");
    currentMuted = true;
  } else if (view.current_speed_kn != null) {
    if (!hasCurrent) {
      currentText = `< ${num1(CURRENT_RELEVANCE_THRESHOLD_KN)} kn`;
      currentMuted = true;
    } else if (spread?.current_speed_range) {
      currentText = fmtRange1(spread.current_speed_range, "kn");
    } else {
      currentText = t(currentKey, { speed: num1(view.current_speed_kn) });
    }
  }

  // The direction of the leg as drawn on the chart, with no current, no
  // leeway, and none of the boards of a beat: a route, not a heading to
  // steer. The app does not navigate; the hint says so where it is read.
  const routeText = t("panel.legDetail.routeValue", {
    deg: Math.round(view.bearing_avg_deg),
    sail: view.point_of_sail,
  });

  const noteColor = (tone: LegDetailNote["tone"]): string =>
    tone === "waves" ? FORCE_COLORS.waves : tone === "current" ? FORCE_COLORS.current : "var(--ow-fg-2)";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--ow-bg-1)", border: "1px solid var(--ow-line)" }}
    >
      {/* Body: dial on the left, numbers on the right. */}
      <div className="flex items-center gap-2 px-2 py-2.5">
        <ConditionsCompass
          size={compact ? COMPASS_COMPACT_PX : COMPASS_PX}
          variant={spread ? "average" : "step"}
          bearingDeg={view.bearing_avg_deg}
          windDeg={view.twd_avg_deg}
          waveDeg={hasWaves ? view.twd_avg_deg + WAVE_OFFSET_DEG : null}
          currentDeg={hasCurrent ? view.current_direction_to_deg : null}
          windArc={spread?.twd_arc ?? null}
          currentArc={hasCurrent ? spread?.current_arc ?? null : null}
          ariaLabel={t("panel.legDetail.compassAria")}
        />

        <div className="flex-1 min-w-0 tabular-nums leading-snug" style={mono}>
          {/* Which slice of the leg: the whole of it, or one step. */}
          <div className="text-[11px] mb-1">
            <span className="font-semibold" style={{ color: "var(--ow-fg-0)" }}>{header.title}</span>
            {header.sub && <span style={{ color: "var(--ow-fg-2)" }}> · {header.sub}</span>}
          </div>
          {compact ? (
            <div className="text-[11px]" style={{ color: "var(--ow-fg-1)" }} title={t("panel.legDetail.routeHint")}>
              {t("panel.legDetail.rowRoute")} {routeText}
            </div>
          ) : (
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <TableRow label={t("panel.legDetail.rowWind")} color={FORCE_COLORS.wind}>{windText}</TableRow>
              <TableRow label={t("panel.legDetail.rowSea")} color={FORCE_COLORS.waves} muted={!seaText}>
                {seaText ?? t("panel.legDetail.seaNotObserved")}
              </TableRow>
              {currentText && (
                <TableRow label={t("panel.legDetail.rowCurrent")} color={FORCE_COLORS.current} muted={currentMuted}>
                  {currentText}
                </TableRow>
              )}
              {/* Grey: not a force, and not to be mistaken for the speed. */}
              <TableRow label={t("panel.legDetail.rowRoute")} color="var(--ow-fg-2)" plain>
                <span title={t("panel.legDetail.routeHint")}>{routeText}</span>
              </TableRow>
            </tbody>
          </table>
          )}

          {/* The over-ground speed and, on a step, how it adds up: the first
              term has no sign, the line reads as the sum it is. Not on the
              average: a mean of sums misled more than it explained, the
              note below sends the reader to the steps instead. */}
          <div
            className={compact ? "mt-1 flex items-baseline gap-1.5" : "mt-1.5 pt-1.5 flex items-baseline gap-2"}
            style={compact ? undefined : { borderTop: "1px solid var(--ow-line)" }}
          >
            {!compact && (
              <span className="shrink-0 text-[11px]" style={{ color: "var(--ow-fg-2)", width: LABEL_PX }}>
                {t("panel.legDetail.rowSpeed")}
              </span>
            )}
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--ow-accent)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {num1(view.target_speed_kn)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>
              {t("panel.legDetail.speedUnit")}
            </span>
          </div>
          {!spread && (
            <div className="mt-1 text-[10px] flex flex-wrap gap-x-1.5" style={{ paddingLeft: compact ? 0 : LABEL_PX + 8 }}>
              {view.motor_used ? (
                // Under engine neither the polar nor the sea apply: the boat
                // does the motoring speed and only the current moves the
                // figure, so the one term is the speed through water itself.
                <span style={{ color: "var(--ow-fg-1)" }}>
                  {t("panel.legDetail.buildUpMotor", { value: num1(view.boat_speed_kn) })}
                </span>
              ) : (
                <>
                  <span style={{ color: FORCE_COLORS.wind }}>
                    {t("panel.legDetail.buildUpPolar", { value: num1(view.polar_after_eff_kn) })}
                  </span>
                  {hasWaves && Math.abs(view.wave_delta_kn) > 0.05 && (
                    <span style={{ color: FORCE_COLORS.waves }}>
                      {t("panel.legDetail.buildUpSea", { value: fmtSigned1(view.wave_delta_kn) })}
                    </span>
                  )}
                </>
              )}
              {currentDelta && (
                <span style={{ color: FORCE_COLORS.current }}>
                  {t("panel.legDetail.buildUpCurrent", { value: fmtSigned1(view.current_delta_kn ?? 0) })}
                </span>
              )}
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-1.5 text-[10px] leading-snug" style={{ paddingLeft: compact ? 0 : LABEL_PX + 8 }}>
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
