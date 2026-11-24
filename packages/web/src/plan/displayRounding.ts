// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Figures that are read together, rounded so they agree as printed (#532).
 *
 * Each figure of the plan used to be rounded on its own. A speed of 3,96 kn
 * made of 4,24 of polar, −0,17 of sea and −0,11 of current printed as
 * « 4,0 » over « 4,2 polaire −0,2 mer −0,1 courant », which adds up to 3,9;
 * a sum of three legs printed a tenth off the total above them; a leg of
 * 10:00:00 to 11:35:51 printed « 1h36 » between the clocks « 10:00 » and
 * « 11:35 ». None of it is wrong by more than a rounding, and all of it makes
 * the reader stop and count. The rule, written once here:
 *
 * - A total is printed as it would be alone, so the same figure elsewhere
 *   (the speed in the table of the steps, the distance in the totals) does
 *   not move.
 * - The parts are rounded to the same precision, then the tenths still
 *   missing (or in excess) go, one at a time, to the part whose true value
 *   sits closest to the next tenth in that direction: the part the rounding
 *   had pushed the furthest. A tie goes to the biggest part. Every part
 *   printed is then its true value rounded down or up, never further, and
 *   the parts add up to the total exactly.
 * - A part that comes out at zero is not printed: if a term was too small
 *   to move the total, it is not shown, and when the total differs from the
 *   first part, a printed term carries the difference.
 * - A duration between two clocks is read on the clocks as printed: both
 *   ends cut to the minute, as `fmtClock` cuts them, so a run of durations
 *   adds up to the span of its first and last clocks.
 *
 * Display only: nothing here changes a value the engine computed.
 */

import type { AggregatedLeg } from "./aggregateLegs";

const ROUNDERS = new Map<number, Intl.NumberFormat>();

/**
 * `x` rounded to `digits` decimals exactly as the screen prints it: by the
 * same `Intl.NumberFormat` rounding as `numFixed`, which is not `toFixed`'s
 * (0.15 prints « 0,2 », `toFixed` says 0.1). The language changes the
 * separator, never the rounding, so one plain formatter per precision does.
 */
export function roundShown(x: number, digits: number): number {
  let f = ROUNDERS.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    ROUNDERS.set(digits, f);
  }
  return Number(f.format(x)) || 0; // `|| 0`: no −0, printed « -0,0 »
}

/**
 * `parts` rounded to `digits` decimals so that they add up to `total`
 * rounded the same way (see the rule above). The parts need not be of one
 * sign: a gain and a loss are apportioned alike.
 */
export function roundToSum(parts: number[], total: number, digits: number): number[] {
  const scale = 10 ** digits;
  const units = (x: number) => Math.round(roundShown(x, digits) * scale);
  const out = parts.map(units);
  let missing = units(total) - out.reduce((s, u) => s + u, 0);
  while (missing !== 0 && out.length > 0) {
    const step = Math.sign(missing);
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < out.length; i++) {
      const cost = Math.abs((out[i] + step) / scale - parts[i]);
      // Tolerance for the float noise of two equal costs, so the tie rule
      // decides rather than the last bit.
      const better = cost < bestCost - 1e-9;
      const tie = !better && Math.abs(cost - bestCost) <= 1e-9 && Math.abs(parts[i]) > Math.abs(parts[best]);
      if (better || tie) {
        best = i;
        bestCost = cost;
      }
    }
    out[best] += step;
    missing -= step;
  }
  return out.map((u) => u / scale || 0);
}

/**
 * Display shares of a total: `parts` (the legs of a passage, the steps of a
 * leg) rounded to add up to `total` as printed. `total` may be the exact sum
 * or that sum as printed already (a leg's share of the passage, which its
 * steps must add up to): it lies within one unit of the last digit of the
 * sum. A total further off is not the sum of these parts (they cover only
 * some of it) and is not forced on them: they then add up to their own sum.
 */
export function sharesShown(parts: number[], total: number, digits: number): number[] {
  const sum = parts.reduce((s, x) => s + x, 0);
  const tolerance = 1 / 10 ** digits + 1e-9;
  return roundToSum(parts, Math.abs(sum - total) < tolerance ? total : sum, digits);
}

/**
 * How the speed over ground of a step adds up, as printed: each term to the
 * tenth of a knot, and the terms summing to the speed printed above them.
 * A term at 0 is not printed.
 *
 * Under sail: polar (the sail speed before the sea), sea (≤ 0), current.
 * Under engine: the motoring speed and the current; neither the polar nor
 * the sea apply.
 */
export interface SpeedBuildUp {
  /** The speed over ground, as the big figure and the table print it. */
  total: number;
  /** Under sail: the polar term. Under engine: the motoring speed. */
  base: number;
  /** ≤ 0; 0 under engine or without sea data. */
  sea: number;
  /** Signed; 0 without current data or when it does not move the tenth. */
  current: number;
}

export function speedBuildUp(view: AggregatedLeg): SpeedBuildUp {
  const motor = view.motor_used;
  const hasSea = !motor && view.hs_avg_m != null;
  const hasCurrent = view.current_delta_kn != null;
  // Only the terms that exist can carry a missing tenth: a sea term on a
  // step without sea data would explain a difference it did not make.
  const parts: number[] = [motor ? view.boat_speed_kn : view.polar_after_eff_kn];
  if (hasSea) parts.push(view.wave_delta_kn);
  if (hasCurrent) parts.push(view.current_delta_kn as number);
  // The total the terms add up to, which is the speed over ground: under
  // engine the build-up starts from the speed through water, so the total
  // is that plus the current, as the server computed it.
  const shown = roundToSum(parts, view.target_speed_kn, 1);
  return {
    total: roundShown(view.target_speed_kn, 1),
    base: shown[0],
    sea: hasSea ? shown[1] : 0,
    current: hasCurrent ? shown[hasSea ? 2 : 1] : 0,
  };
}

/**
 * Whole minutes between two instants as their clocks print them: each end
 * cut to its minute, as `fmtClock` does. 10:00:00 to 11:35:51 is 95 minutes,
 * « 10:00 → 11:35 », not the 96 its exact length rounds to. Never negative;
 * NaN when either instant does not parse.
 */
export function clockMinutes(start: string | Date, end: string | Date): number {
  const minute = (when: string | Date) =>
    Math.floor(new Date(when).getTime() / 60_000);
  return Math.max(0, minute(end) - minute(start));
}
