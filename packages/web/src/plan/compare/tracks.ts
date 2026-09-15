// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The track axis of « Comparer ce trajet », as pure functions.
 *
 * Here the departure is frozen and the track varies: two or three routes
 * drawn by hand between the same ends, each computed with the plan's
 * departure and boat, read side by side. Option 1 is the plan's own track;
 * the variants are drawn on the map. Nothing is elected: the same figures
 * as on the departure axis are aligned, and the reader judges.
 */

import type { ComplexityScore, PassageReport } from "../types";
import { haversineNm } from "../../utils/geo";
import { fmtDurationSafe } from "../format";
import { motorShare } from "./slots";

/** One option. `passage` is null until its computation lands, and again
    when the departure or the boat changed under it. */
export interface Track {
  id: string;
  waypoints: [number, number][];
  /** Naive local "YYYY-MM-DDTHH:MM" of the moment it was drawn; the plan's
      own track carries the moment the first variant was. */
  createdAt: string;
  passage: PassageReport | null;
  complexity: ComplexityScore | null;
  /** The failure of its last computation, in the reader's language. */
  error: string | null;
}

/** A variant may not reach past three options: the map cannot hold more
    lines side by side and the reader cannot either. */
export const MAX_TRACKS = 3;

/** The id of option 1, the plan's own track. */
export const PLAN_TRACK_ID = "plan";

/** The three colours, by position: the plan's track first. */
const COLOR_TOKENS = ["--ow-route-a", "--ow-route-b", "--ow-route-c"] as const;

export function trackColorToken(index: number): string {
  return COLOR_TOKENS[Math.min(index, COLOR_TOKENS.length - 1)];
}

/** The variant being drawn: the plan's two ends, and whatever the reader
    put between them. */
export function startVariant(planWaypoints: [number, number][]): [number, number][] {
  if (planWaypoints.length < 2) return [];
  return [planWaypoints[0], planWaypoints[planWaypoints.length - 1]];
}

/** A tap on the map adds a point before the arrival, so the variant keeps
    the plan's ends by construction. */
export function addVariantPoint(
  variant: [number, number][],
  lat: number,
  lon: number,
): [number, number][] {
  if (variant.length < 2) return [...variant, [lat, lon]];
  const next = [...variant];
  next.splice(next.length - 1, 0, [lat, lon]);
  return next;
}

/** Whether a variant says something a straight line between the ends does
    not: at least one point of its own. */
export function isVariantComplete(variant: [number, number][]): boolean {
  return variant.length >= 3;
}

export interface TrackSummary {
  distanceNm: number;
  durationH: number;
  arrival: string;
  /** Distance-weighted mean wave height, null without sea data. */
  hsAvgM: number | null;
  hsMaxM: number | null;
  /** 0 to 100. */
  motorPct: number | null;
  alerts: number;
}

/** The five figures of a track, from its passage. */
export function summariseTrack(passage: PassageReport, complexity: ComplexityScore | null): TrackSummary {
  let hsDist = 0;
  let hsSum = 0;
  let hsMax: number | null = null;
  for (const seg of passage.segments) {
    if (seg.hs_m != null) {
      hsDist += seg.distance_nm;
      hsSum += seg.hs_m * seg.distance_nm;
      hsMax = hsMax === null ? seg.hs_m : Math.max(hsMax, seg.hs_m);
    }
  }
  return {
    distanceNm: passage.distance_nm,
    durationH: passage.duration_h,
    arrival: passage.arrival_time,
    hsAvgM: hsDist > 0 ? hsSum / hsDist : null,
    hsMaxM: hsMax,
    motorPct: motorShare(passage),
    alerts: (passage.warnings?.length ?? 0) + (complexity?.warnings?.length ?? 0),
  };
}

/** What the map draws for one option. */
export interface RouteOverlay {
  id: string;
  waypoints: [number, number][];
  /** Design token of the colour, resolved at draw time so the theme applies. */
  colorToken: string;
  dashed?: boolean;
  dim?: boolean;
  /** Pill at the midpoint of the line: "2 · 5h55". */
  label?: string;
}

/** The point halfway along a polyline, by distance, for its pill. */
export function midpointAlong(path: [number, number][]): [number, number] {
  if (path.length === 1) return path[0];
  const legs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineNm(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
    legs.push(d);
    total += d;
  }
  let remaining = total / 2;
  for (let i = 0; i < legs.length; i++) {
    if (remaining <= legs[i] || i === legs.length - 1) {
      const f = legs[i] > 0 ? Math.max(0, Math.min(1, remaining / legs[i])) : 0;
      const [aLat, aLon] = path[i];
      const [bLat, bLon] = path[i + 1];
      return [aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f];
    }
    remaining -= legs[i];
  }
  return path[0];
}

/** The plan alone, as the only option, before any variant exists. */
export function planAsTrack(
  waypoints: [number, number][],
  passage: PassageReport | null,
  complexity: ComplexityScore | null,
): Track {
  return { id: PLAN_TRACK_ID, waypoints, createdAt: "", passage, complexity, error: null };
}

export interface OverlayInput {
  /** The stored options, or the plan alone. */
  options: Track[];
  /** A variant is being drawn: every option becomes a ghost behind it. */
  drawing: boolean;
  /** The track axis is on screen: every option is drawn, the pointed one full. */
  tracksAxis: boolean;
  /** An option is open in the plan: the others stay as dashed ghosts. */
  openedInPlan: boolean;
  highlightedTrackId: string | null;
  openedTrackId: string | null;
}

/** What the map draws over its own route, per situation. */
export function routeOverlays(input: OverlayInput): RouteOverlay[] {
  const { options, drawing, tracksAxis, openedInPlan, highlightedTrackId, openedTrackId } = input;
  if (drawing) {
    return options.map((o, i) => ({
      id: o.id,
      waypoints: o.waypoints,
      colorToken: trackColorToken(i),
      dashed: true,
      dim: true,
    }));
  }
  if (tracksAxis) {
    const active = highlightedTrackId ?? openedTrackId ?? options[0]?.id ?? null;
    return options.map((o, i) => ({
      id: o.id,
      waypoints: o.waypoints,
      colorToken: trackColorToken(i),
      dim: active !== null && o.id !== active,
      label: o.passage ? `${i + 1} · ${fmtDurationSafe(o.passage.duration_h)}` : `${i + 1}`,
    }));
  }
  if (openedInPlan) {
    return options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => o.id !== openedTrackId)
      .map(({ o, i }) => ({
        id: o.id,
        waypoints: o.waypoints,
        colorToken: trackColorToken(i),
        dashed: true,
        dim: true,
      }));
  }
  return [];
}
