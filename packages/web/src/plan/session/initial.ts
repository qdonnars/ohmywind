// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * What `/plan` looks like the instant it mounts.
 *
 * Three media persist a plan, and each of them used to be consulted from a
 * different place in `PlanPage`: twenty `useState` initialisers picked the
 * route, the boat and the departure, then a mount effect went back over the
 * same three sources to decide whether to restore results, rewrite the URL or
 * compute. The rules were correct but nowhere written down, `loadLastSimulation`
 * ran on every render, and none of it was testable. This module is that
 * decision, once, as a pure function.
 *
 * ## The three media
 *
 * | Medium | Written when | Lifetime |
 * |---|---|---|
 * | `sessionStorage` draft (`plan/draft.ts`) | on every edit, while results are stale | the tab |
 * | the `/plan` URL | after a successful computation | the link |
 * | `localStorage` cache (`plan/lastSimulation.ts`) | after a successful computation | the browser |
 *
 * ## Precedence
 *
 * | Field | Order |
 * |---|---|
 * | route (waypoints) | draft > URL (2 points or more) > cache (2 points or more) > empty |
 * | boat | custom polar (pinned) > draft > URL > cache > /config default |
 * | departure | draft > URL > cache > tomorrow, same hour, on the hour |
 * | time anchor | draft > departure |
 * | mode | draft > cache > single |
 * | sweep range and step | draft > cache > derived from the departure |
 *
 * Two rules cut across the table:
 *
 * - **Freshness.** A departure already behind us is never seeded, whatever
 *   supplied it: a draft left overnight or a bookmarked link from last week
 *   falls through to the default rather than putting the slider in the past.
 * - **The cache only speaks when the URL is silent.** The URL carries a route,
 *   so a link is authoritative over what this browser last computed; the cache
 *   is then read only to *restore results* for that same route, never to seed
 *   the route itself.
 *
 * ## Restoring results
 *
 * Persisted results are handed back only when the cache is about the same
 * route, the same boat and the same `/config` fingerprint. A departure that
 * does not match the seeded one keeps the single-mode block out but leaves the
 * compare table in, since the sweep range is not encoded in the URL.
 *
 * ## What the caller still has to do
 *
 * `mount.rewriteUrl` and `mount.fetch` say whether the address bar has to be
 * synced with the restored session and whether a computation is owed. A
 * restored draft asks for neither: it is by construction the most recent state
 * and it has no results, so the page opens stale and waits for « Recalculer ».
 */

import type { ParseResult } from "../parseUrl";
import { isParsedOk } from "../parseUrl";
import type { PlanDraft } from "../draft";
import type { LastSimulation } from "../lastSimulation";
import { waypointsEqual } from "../lastSimulation";
import type { PassageReport, ComplexityScore, PassageWindow } from "../types";
import type { PolarConfig } from "../../config/polarConfig";
import { initialPlanBoat, isPersoActive } from "../../config/polarConfig";
import type { TimeAnchor, PlanMode } from "../ModeToggle";
import { toNaiveLocal } from "../../domain/datetime";

type RouteSource = "draft" | "url" | "cache" | "none";
type BoatSource = "polar" | "draft" | "url" | "cache" | "default";
type DepartureSource = "draft" | "url" | "cache" | "default";

export interface InitialSessionInput {
  /** Result of `parsePlanUrl(location.search)`. An unparseable query string is
      handled like an empty one for seeding, and reported through `urlError`. */
  url: ParseResult;
  /** This tab's uncommitted state, or null. */
  draft: PlanDraft | null;
  /** The persisted last simulation, read once. */
  cache: LastSimulation | null;
  polarConfig: PolarConfig;
  /** `activeModels + polarFingerprint` at mount, used to reject results
      computed under other preferences. */
  configFingerprint: string;
  /** Epoch ms. Injected so the freshness rules are testable. */
  now: number;
}

export interface InitialSession {
  waypoints: [number, number][];
  archetype: string;
  /** Naive local "YYYY-MM-DDTHH:MM". In arrival mode this is a target ETA. */
  departure: string;
  timeAnchor: TimeAnchor;
  mode: PlanMode;
  sweepEarliest: string;
  sweepLatest: string;
  sweepIntervalHours: number;

  /** Results restored from the cache, all null when nothing was restored. */
  passage: PassageReport | null;
  complexity: ComplexityScore | null;
  windows: PassageWindow[] | null;
  metaWarnings: string[];
  forecastUpdatedAt: string | null;

  /** "Edited since the last computation". True for a restored draft. */
  isStale: boolean;
  /** Mobile only: skip the compact "pick a mode" step, we already have a route. */
  actionTaken: boolean;

  /** Map centre hint carried by the home compass FAB. */
  center: [number, number] | null;
  /** Non-null when the query string could not be parsed. */
  urlError: string | null;

  mount: {
    /** Sync the address bar with the restored session (URL was silent). */
    rewriteUrl: boolean;
    /** Nothing usable was restored for this route: compute it. */
    fetch: boolean;
  };

  sources: {
    route: RouteSource;
    boat: BoatSource;
    departure: DepartureSource;
  };
}

/** Slider lands on J+1 by default: a now-anchored start is rarely what a
    sailor wants when planning, and the "Maintenant" tick under the slider
    remains one click away. */
export function tomorrowRoundedLocal(now: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  return toNaiveLocal(d);
}

/** Default end of a sweep: two days after its start. */
export function defaultSweepLatest(departure: string): string {
  const d = new Date(departure);
  d.setDate(d.getDate() + 2);
  return toNaiveLocal(d);
}

/** A departure is only seeded while it is still ahead of us. */
function isFuture(value: string | undefined | null, now: number): value is string {
  return !!value && new Date(value).getTime() >= now;
}

export function resolveInitialSession(input: InitialSessionInput): InitialSession {
  const { url, draft, cache, polarConfig, configFingerprint, now } = input;

  const urlOk = isParsedOk(url);
  const urlWaypoints = urlOk ? url.waypoints : [];
  const urlHasWaypoints = urlWaypoints.length >= 2;

  // The cache seeds nothing while the URL carries a route: a shared link wins
  // over what this browser happens to have computed last.
  const seedCache = urlHasWaypoints ? null : cache;
  const useCachedRoute = !!(seedCache && seedCache.waypoints.length >= 2);

  // ── route ──────────────────────────────────────────────────────────────────
  let waypoints: [number, number][] = [];
  let routeSource: RouteSource = "none";
  if (draft) {
    waypoints = draft.waypoints;
    routeSource = "draft";
  } else if (urlHasWaypoints) {
    waypoints = urlWaypoints;
    routeSource = "url";
  } else if (useCachedRoute) {
    waypoints = seedCache.waypoints;
    routeSource = "cache";
  }

  // ── boat ───────────────────────────────────────────────────────────────────
  // A customized polar pins the boat to cfg.base, the hull the tuning was built
  // on and the one the selector displays, so a stale URL or cache slug from an
  // earlier session cannot silently re-board the plan on another boat (#220).
  const draftOrUrlSlug = draft?.archetype ?? (urlOk ? url.archetype : null);
  const cachedSlug = useCachedRoute ? seedCache.archetype : null;
  const archetype = initialPlanBoat(polarConfig, draftOrUrlSlug, cachedSlug);
  const boatSource: BoatSource = isPersoActive(polarConfig)
    ? "polar"
    : draftOrUrlSlug
      ? draft?.archetype
        ? "draft"
        : "url"
      : cachedSlug
        ? "cache"
        : "default";

  // ── departure ──────────────────────────────────────────────────────────────
  // Prefer the single-mode departure, then the sweep's earliest timestamp so a
  // compare-only cache still seeds the slider.
  const cachedDeparture = seedCache?.single?.departure ?? seedCache?.compare?.sweepEarliest;
  let departure: string;
  let departureSource: DepartureSource;
  if (isFuture(draft?.departure, now)) {
    departure = draft.departure;
    departureSource = "draft";
  } else if (urlOk && isFuture(url.departure, now)) {
    departure = url.departure;
    departureSource = "url";
  } else if (isFuture(cachedDeparture, now)) {
    departure = cachedDeparture;
    departureSource = "cache";
  } else {
    departure = tomorrowRoundedLocal(now);
    departureSource = "default";
  }

  // ── mode, anchor, sweep ────────────────────────────────────────────────────
  const timeAnchor: TimeAnchor = draft?.timeAnchor ?? "departure";
  const mode: PlanMode = draft?.mode ?? seedCache?.mode ?? "single";
  const sweepEarliest =
    draft?.sweepEarliest ?? seedCache?.compare?.sweepEarliest ?? departure;
  const sweepLatest =
    draft?.sweepLatest ?? seedCache?.compare?.sweepLatest ?? defaultSweepLatest(departure);
  const sweepIntervalHours =
    draft?.sweepIntervalHours ?? seedCache?.compare?.sweepIntervalHours ?? 3;

  const base = {
    waypoints,
    archetype,
    departure,
    timeAnchor,
    mode,
    sweepEarliest,
    sweepLatest,
    sweepIntervalHours,
    passage: null,
    complexity: null,
    windows: null,
    metaWarnings: [] as string[],
    forecastUpdatedAt: null,
    isStale: draft != null,
    actionTaken: urlHasWaypoints || useCachedRoute || (draft?.waypoints.length ?? 0) >= 2,
    center: urlOk ? url.center : null,
    urlError: urlOk ? null : url.error,
    mount: { rewriteUrl: false, fetch: false },
    sources: { route: routeSource, boat: boatSource, departure: departureSource },
  } satisfies InitialSession;

  // ── results ────────────────────────────────────────────────────────────────

  // Path 0, a draft was restored. It is this tab's most recent state, and by
  // definition it has no results yet. Hydrating the URL's or the cache's
  // results on top would show a passage that does not match the route on
  // screen, and computing would spend a request the user did not ask for.
  if (draft) return base;

  // Path A, the URL carries a route. Respect it, restore from cache when the
  // cache is about the same route + boat + preferences, otherwise compute. The
  // boat compared here is the resolved one, not the raw URL slug: a customized
  // polar overrides the URL's boat and the results shown must be the ones
  // computed on the boat the recap displays (#220).
  if (urlHasWaypoints) {
    const matches =
      cache &&
      waypointsEqual(cache.waypoints, urlWaypoints) &&
      cache.archetype === archetype &&
      // Reject the cache if the user tweaked /config since the simulation ran:
      // the persisted result is stale relative to the active preferences. A
      // missing fingerprint is a pre-config-era cache and never matches.
      cache.configFingerprint === configFingerprint;
    if (matches) {
      // The single-mode block is restored only when its departure is the one
      // seeded above: the URL owns the departure here, and showing a passage
      // computed for another hour under that slider would be a lie. The sweep
      // table has no such constraint, its range is not encoded in the URL.
      const restored = restoreFrom(cache, { requireDepartureMatch: departure });
      // Historic quirk, kept deliberately: a cache holding only a single-mode
      // result whose departure does not match the seeded one restores nothing
      // and still does not compute. Reachable by opening an old link whose
      // departure has passed, since the seeded departure then falls back to
      // tomorrow. Changing it would fire a computation on mount for a user who
      // only followed a stale bookmark, so it belongs to its own decision.
      if (cache.single || cache.compare) return { ...base, ...restored };
    }
    return { ...base, mount: { rewriteUrl: false, fetch: true } };
  }

  // Path B, the URL is silent and the cache supplied the route. Sync the
  // address bar so reload and share work, and skip the network.
  if (useCachedRoute) {
    // Discard the persisted results and recompute when /config changed since
    // the cache was written, or when the cached simulation ran on another boat
    // than the seeded one (a customized polar re-pins the boat to its base, and
    // the cached run may predate the fix for #220). Route, boat and departure
    // stay seeded either way.
    if (seedCache.configFingerprint !== configFingerprint || seedCache.archetype !== archetype) {
      return { ...base, mount: { rewriteUrl: true, fetch: true } };
    }
    // No departure check here, unlike path A: the departure itself was seeded
    // from this very cache, and when the cached one has expired the user is
    // looking at their last plan with a fresh slider under it, which is the
    // starting point for the recomputation they are about to ask for.
    return {
      ...base,
      ...restoreFrom(seedCache, {}),
      mount: { rewriteUrl: true, fetch: false },
    };
  }

  return base;
}

/** The subset of the state that comes back from a matching cache. */
function restoreFrom(
  cache: LastSimulation,
  opts: { requireDepartureMatch?: string },
): Pick<
  InitialSession,
  "passage" | "complexity" | "windows" | "metaWarnings" | "forecastUpdatedAt"
> {
  const single =
    cache.single &&
    (opts.requireDepartureMatch === undefined ||
      cache.single.departure === opts.requireDepartureMatch)
      ? cache.single
      : null;
  return {
    passage: single?.passage ?? null,
    complexity: single?.complexity ?? null,
    windows: cache.compare?.windows ?? null,
    metaWarnings: cache.compare?.metaWarnings ?? [],
    // The single-mode block owns the freshness stamp when it was restored; the
    // sweep's own stamp is used only when it was not.
    forecastUpdatedAt:
      single?.forecastUpdatedAt ?? cache.compare?.forecastUpdatedAt ?? null,
  };
}
