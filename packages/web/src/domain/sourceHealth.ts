// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Whether the copy we serve of a tidal source is as recent as its update
 * plan says it should be.
 *
 * The registry states, per source, how often our copy is meant to be
 * refreshed (`update_cadence`); the server states, per atlas, when it was
 * built and the last instant its analysis covered (`built_at`,
 * `record_end`). Put together they answer the question the registry table
 * asks: is this up to date, or did the last planned refresh not happen?
 *
 * "Late" does not mean wrong for a harmonic atlas: the constants of a year
 * of tide stay valid for years, so a late atlas keeps being served and is
 * only flagged. What it catches is a refresh pipeline that stopped.
 */
import type { CoverageAtlas } from "./tidalMapGeo";

export type UpdateCadence = "live" | "daily" | "weekly" | "monthly" | "yearly" | "decade" | "frozen" | "none";

export type Freshness =
  /** Read from the provider on every request (Open-Meteo SMOC). */
  | "live"
  /** Served, and refreshed within its cadence. */
  | "fresh"
  /** Served, but the last planned refresh did not happen. */
  | "late"
  /** Served, a frozen edition that is never refreshed (MARC, SHOM). */
  | "frozen"
  /** Served, but the server does not say when it was built. */
  | "undated"
  /** Not served: nothing to judge. */
  | "unserved";

const DAY_MS = 86_400_000;

/** How old our copy may get before the refresh counts as missed: the
    cadence plus a margin for a run that lands a little late. */
export const MAX_AGE_DAYS: Record<Exclude<UpdateCadence, "live" | "frozen" | "none">, number> = {
  daily: 2,
  weekly: 10,
  monthly: 40,
  yearly: 400,
  decade: 11 * 365,
};

export interface SourceFreshness {
  state: Freshness;
  /** The date the judgement rests on (end of the analysed record, else the build), ISO. */
  asOf?: string;
}

export function sourceFreshness(
  cadence: UpdateCadence | undefined,
  servedAtlases: CoverageAtlas[],
  now: Date = new Date(),
): SourceFreshness {
  if (cadence === "live") return { state: "live" };
  if (!servedAtlases.length) return { state: "unserved" };
  if (cadence === "frozen" || cadence === "none" || cadence === undefined) return { state: "frozen" };
  const dates = servedAtlases
    .map((a) => a.record_end ?? a.built_at)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .map((d) => ({ iso: d, ms: Date.parse(d) }))
    .filter((d) => Number.isFinite(d.ms));
  if (!dates.length) return { state: "undated" };
  // The source is as fresh as its stalest served atlas: one box that stopped
  // being refreshed is a pipeline to look at.
  const oldest = dates.reduce((a, b) => (b.ms < a.ms ? b : a));
  const ageDays = (now.getTime() - oldest.ms) / DAY_MS;
  return { state: ageDays > MAX_AGE_DAYS[cadence] ? "late" : "fresh", asOf: oldest.iso };
}
