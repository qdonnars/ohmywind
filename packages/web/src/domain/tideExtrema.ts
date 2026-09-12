// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * High and low waters of an hourly tide series, located between the samples.
 *
 * The series is sampled on the hour, but a high water falls on the hour only
 * by chance: the sample that reads highest is the one nearest the peak, up to
 * half an hour off, and reads lower than the peak itself (10 cm on a 6 m
 * range). Labelling that sample "HW 14:00, 5.90 m" was read as an annual-style
 * prediction and compared to SHOM's "14:23, 6.01 m" (#388).
 *
 * Around its turn a tide runs as a cosine, and over three consecutive hours a
 * parabola fits it closely: the vertex of the parabola through the samples at
 * i-1, i and i+1 gives the time of the extremum as a fraction of the sample
 * step, and its height. That is the classic three-point refinement, exact for
 * a parabola and a few minutes off for the cosine at worst.
 */

export interface TideExtremum {
  /** Index of the sample nearest the extremum (the local max or min). */
  idx: number;
  type: "high" | "low";
  /**
   * Offset of the true extremum from sample `idx`, in sample steps. Always in
   * [-0.5, 0.5]: the vertex cannot be further than half a step from the
   * highest (lowest) of the three samples.
   */
  offset: number;
  /** Height at the vertex, in the unit of the series. */
  height: number;
}

/**
 * Vertex of the parabola through (-1, a), (0, b), (1, c). `b` is the extreme
 * sample, so the second difference `a - 2b + c` is never zero (it is strictly
 * negative for a high, positive for a low).
 */
function vertex(a: number, b: number, c: number): { offset: number; height: number } {
  const denom = a - 2 * b + c;
  const offset = (a - c) / (2 * denom);
  const height = b - ((a - c) * (a - c)) / (8 * denom);
  return { offset, height };
}

export function findTideExtrema(values: readonly (number | null)[]): TideExtremum[] {
  const out: TideExtremum[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1];
    const b = values[i];
    const c = values[i + 1];
    if (a == null || b == null || c == null) continue;
    // ≥ on one side to break ties on flat plateaus (rare but possible). The
    // ≥ side yields a vertex offset of exactly 0.5, i.e. midway between the
    // two equal samples, which is the right answer for a symmetric peak.
    if (b > a && b >= c) out.push({ idx: i, type: "high", ...vertex(a, b, c) });
    else if (b < a && b <= c) out.push({ idx: i, type: "low", ...vertex(a, b, c) });
  }
  return out;
}
