// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { parsePlanUrl, isParsedOk, buildPlanUrl } from "../plan/parseUrl";
import { PlanMap, type PlanMapHandle } from "../plan/PlanMap";
import { PlanSidebar } from "../plan/PlanSidebar";
import { fetchPassage, fetchPassageByEta, fetchPassageWindows, fetchArchetypes, friendlyError, type PlanOverrides } from "../api/passage";
import { buildForecastCacheSafe, singleWindowMs, sweepWindowMs, etaWindowMs } from "../api/forecastCache";
import { Header } from "../components/Header";
import type { PassageReport, ComplexityScore, Archetype, PassageWindow } from "../plan/types";
import { fmtDuration, fr1 } from "../plan/format";
import { HeroCell } from "../plan/PlanStates";
import {
  loadLastSimulation,
  saveLastSimulation,
  clearLastSimulation,
  waypointsEqual,
  type LastSimulation,
} from "../plan/lastSimulation";
import { type TimeAnchor } from "../plan/ModeToggle";
import { computeLegSegmentRanges } from "../plan/aggregateLegs";
import { activeModels, loadModelConfig } from "../config/modelConfig";
import { effectivePolar, initialPlanBoat, isPersoActive, isPolarCustomized, loadPolarConfig, planEfficiency, polarFingerprint, savePolarConfig } from "../config/polarConfig";
import { LocateButton } from "../components/LocateButton";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapView } from "../hooks/useMapView";
import { parseMapView, mapViewQuery } from "../utils/mapViewParams";
import { setCookie, clearCookie } from "../utils/cookies";

// Build the plan-time overrides payload from current /config preferences.
// Read at request time (not at mount) so a /config tweak takes effect on the
// next refetch without a page reload. Polar matrix is only attached when the
// editor deviates from the default for the active archetype — otherwise the
// server's bundled polar wins, saving ~kB per request.
function resolveOverrides(): PlanOverrides {
  const overrides: PlanOverrides = {};
  const modelCfg = loadModelConfig();
  const models = activeModels(modelCfg);
  if (models.length > 0) overrides.models = models;
  const polarCfg = loadPolarConfig();
  if (isPersoActive(polarCfg)) {
    // The custom matrix is always built on cfg.base's grid — the boat of
    // record while the perso polar is the active pick (#220). The page's slug
    // matches it (seeded via initialPlanBoat, re-pinned by handlePersoSelect),
    // so passing it here would be redundant at best and, in a cross-tab
    // /config edit, would resurrect the mismatch. When perso is parked in
    // favour of a stock archetype, no matrix travels: the server's bundled
    // polar for the requested slug wins.
    overrides.polar = effectivePolar(polarCfg);
  }
  return overrides;
}

// Plan-time efficiency — the /config performance coefficient, always explicit
// since config v3 (1.0 = race trim, 0.75 = typical cruising).
function resolveEfficiency(): number {
  return planEfficiency(loadPolarConfig());
}

// Joint fingerprint of model + polar config. Same shape across single &
// compare so the cache check is one-liner. Read at the same moment as the
// fetch so the persisted simulation is paired with the config that produced it.
function currentConfigFingerprint(): string {
  return `${activeModels(loadModelConfig()).join(",")}|${polarFingerprint(loadPolarConfig())}`;
}

// ── local helpers (mobile components) ────────────────────────────────────────

// "YYYY-MM-DDTHH:MM" in local time from any ISO timestamp. Mirror of
// `toTzAware`'s inverse — used to round-trip a server-resolved departure
// back into the slider/URL format.
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Slider lands on J+1 by default — a now-anchored start is rarely what a
// sailor wants when planning, and the "Maintenant" tick under the slider
// remains one click away.
function tomorrowRoundedLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Append local timezone offset to a naive "YYYY-MM-DDTHH:MM" string.
// If already timezone-aware (ends with Z or ±HH:MM), return as-is.
function toTzAware(iso: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(iso)) return iso;
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${iso}:00${sign}${hh}:${mm}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
// Hero stats overlay — absolute, bottom of map, mobile only.
// Renders the exact same HeroCell as the desktop sidebar block
// (Distance / Durée / Arrivée) inside a single glass strip, so both
// surfaces are visually and structurally identical.
function PlanHeroStats({ passage, onOpen }: { passage: PassageReport; onOpen?: () => void }) {
  // `pointer-events-auto` is load-bearing: the wrapper below sets
  // `pointer-events-none` so map gestures pass through the empty space around
  // this strip. Without re-enabling it here, a tap on the strip itself fell
  // through to Leaflet and silently appended a waypoint to the route being
  // edited — the banner looked inert while quietly corrupting the plan.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Voir le détail du passage"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className="pointer-events-auto cursor-pointer rounded-xl px-3.5 py-2.5 grid grid-cols-3 gap-3"
      style={{ background: "var(--ow-surface-glass)", backdropFilter: "blur(8px)", border: "1px solid var(--ow-line-2)" }}
    >
      <HeroCell label="Distance" value={fr1(passage.distance_nm)} unit="nm" />
      <HeroCell label="Durée" value={fmtDuration(passage.duration_h)} />
      <HeroCell label="Arrivée" value={fmtTime(passage.arrival_time)} />
    </div>
  );
}

// ── ResizableMobileDrawer ────────────────────────────────────────────────────
// User-resizable bottom drawer: a 4 px grab-handle at the top responds to
// pointer drag (mouse or touch) and adjusts the drawer height in vh. The
// chosen height persists in localStorage so reload feels stable.
//
// Exposes an imperative `.expand()` so callers (e.g. the mode-picker click)
// can pop the drawer up to a sensible reading height when the panel content
// gets richer.

const DRAWER_HEIGHT_KEY = "ow_drawer_vh_v1";
const DRAWER_MIN_VH = 12;
const DRAWER_MAX_VH = 90;
const DRAWER_EXPANDED_VH = 75;

interface DrawerHandle {
  expand: () => void;
  /** Scroll the drawer content back to the top — used when the route turns
   *  stale so the Recalculer bar (hidden by the results fit below) is
   *  visible next to the "Cliquez sur Recalculer" placeholder. */
  scrollToTop: () => void;
}

const ResizableMobileDrawer = forwardRef<DrawerHandle, {
  defaultVh: number;
  /** Optional auto-target height. When this value changes the drawer
   *  animates to it (CSS transition on ``height``). Manual drag still
   *  overrides until the next ``targetVh`` change. Pass ``undefined`` to
   *  fall back to ``defaultVh`` / persisted height with no auto-resize. */
  targetVh?: number;
  /** Fresh-results signal. Whenever this identity changes (and is non-null)
   *  the drawer fits itself to the results: height shrinks so the content
   *  below the ``data-results-anchor`` marker exactly fills it (never grows,
   *  floored at DRAWER_MIN_VH), then the anchor is scrolled to the top. Net
   *  effect: the recap + results open the view, the mode pills + Recalculer
   *  block sits one scroll-up away, and the map gets the freed space. No-op
   *  when the sidebar isn't showing a filled view (no anchor in the DOM). */
  resultsFitKey?: object | null;
  children: React.ReactNode;
}>(function ResizableMobileDrawer({ defaultVh, targetVh, resultsFitKey, children }, ref) {
  const [vh, setVh] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DRAWER_HEIGHT_KEY);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? Math.max(DRAWER_MIN_VH, Math.min(DRAWER_MAX_VH, parsed)) : defaultVh;
    } catch {
      return defaultVh;
    }
  });
  const dragRef = useRef<{ startY: number; startVh: number } | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Animate only when the auto-target moves the drawer; user drag should
  // feel direct (no easing lag). Toggled in onPointerDown/onPointerUp.
  const [isAnimating, setIsAnimating] = useState(false);

  function persist(next: number) {
    try { localStorage.setItem(DRAWER_HEIGHT_KEY, String(next)); } catch { /* best-effort */ }
  }

  // React to targetVh changes: clamp to bounds and animate. We deliberately
  // do NOT persist this value — auto-targets follow app state, while
  // localStorage captures the user's deliberate drag preference.
  useEffect(() => {
    if (targetVh == null) return;
    const clamped = Math.max(DRAWER_MIN_VH, Math.min(DRAWER_MAX_VH, targetVh));
    setIsAnimating(true);
    setVh(clamped);
    const t = setTimeout(() => setIsAnimating(false), 320);
    return () => clearTimeout(t);
  }, [targetVh]);

  // Fit-to-results: see the ``resultsFitKey`` prop doc. Runs one frame after
  // render (rAF) so the filled view is measurable; the height is written to
  // the DOM directly (transition suppressed) so the scroll clamp updates in
  // the same frame — a CSS-animated shrink would keep max-scroll at 0 until
  // the transition ends and the anchor could never reach the top. setVh then
  // re-renders the same height so React state stays the source of truth.
  // Deliberately not persisted: app-driven, like targetVh. Declared after the
  // targetVh effect so on a cache-hydrated mount (both fire) the fit wins.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const outer = outerRef.current;
      const container = contentRef.current;
      if (!outer || !container) return;
      if (resultsFitKey == null) {
        // Back to a form view (mode toggled before its results exist, or
        // reset): restore the flow-driven target height and rewind the
        // scroll — a previous fit may have left the drawer in its compact
        // slot, scrolled past the pills, which would open the form
        // mid-content.
        container.scrollTop = 0;
        if (targetVh != null) {
          setIsAnimating(true);
          setVh(Math.max(DRAWER_MIN_VH, Math.min(DRAWER_MAX_VH, targetVh)));
          setTimeout(() => setIsAnimating(false), 320);
        }
        return;
      }
      const anchor = container.querySelector<HTMLElement>("[data-results-anchor]");
      if (!anchor) return;
      if (outer.offsetHeight === 0) return; // desktop: the drawer is display:none
      const anchorTop =
        anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      // Real content extent, NOT container.scrollHeight — scrollHeight is
      // floored at clientHeight, so when the content is shorter than the
      // drawer it would count the empty space and the fit would stop short.
      const contentEnd = container.lastElementChild?.getBoundingClientRect().bottom
        ?? container.getBoundingClientRect().bottom;
      const belowPx = contentEnd - anchor.getBoundingClientRect().top;
      const chromePx = outer.offsetHeight - container.clientHeight; // grab handle + border
      const currentVh = (outer.offsetHeight / window.innerHeight) * 100;
      // −1 px absorbs sub-pixel rounding: the visible slot must stay ≤ the
      // content below the anchor, or the scroll clamp leaves a sliver of the
      // Recalculer bar visible at the top.
      const desiredVh = ((belowPx - 1 + chromePx) / window.innerHeight) * 100;
      const next = Math.max(DRAWER_MIN_VH, Math.min(currentVh, desiredVh));
      setIsAnimating(false);
      outer.style.transition = "none";
      outer.style.height = `${next}vh`;
      container.scrollTop = anchorTop;
      setVh(next);
    });
    return () => cancelAnimationFrame(raf);
  }, [resultsFitKey, targetVh]);

  useImperativeHandle(ref, () => ({
    expand: () => {
      setVh((prev) => {
        const next = Math.max(prev, DRAWER_EXPANDED_VH);
        if (next !== prev) persist(next);
        return next;
      });
    },
    scrollToTop: () => {
      contentRef.current?.scrollTo({ top: 0 });
    },
  }), []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVh: vh };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY; // up = positive
    const vhDelta = (dy / window.innerHeight) * 100;
    const next = Math.max(DRAWER_MIN_VH, Math.min(DRAWER_MAX_VH, dragRef.current.startVh + vhDelta));
    setVh(next);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      persist(vh);
      dragRef.current = null;
    }
    (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      ref={outerRef}
      className="lg:hidden shrink-0 overflow-y-auto border-t flex flex-col"
      style={{
        height: `${vh}vh`,
        background: "var(--ow-bg-1)",
        borderColor: "var(--ow-line)",
        transition: isAnimating ? "height 280ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionner le panneau"
        onPointerDown={(e) => { setIsAnimating(false); onPointerDown(e); }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 flex items-center justify-center cursor-row-resize touch-none"
        style={{ height: 14, background: "var(--ow-bg-1)" }}
      >
        <span
          className="block rounded-full"
          style={{ width: 36, height: 4, background: "var(--ow-line-2)" }}
        />
      </div>
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
});

// ── ResizableDesktopSidebar ──────────────────────────────────────────────────
// Desktop equivalent of ResizableMobileDrawer: vertical grab-handle on the left
// edge adjusts width in px. Persists in localStorage so reload feels stable.
// Useful when comparing windows — the 7-column table is cramped at 320–384 px.

const SIDEBAR_WIDTH_KEY = "ow_sidebar_px_v1";
const SIDEBAR_MIN_PX = 280;
const SIDEBAR_MAX_PX = 800;

function ResizableDesktopSidebar({
  defaultPx,
  children,
}: {
  defaultPx: number;
  children: React.ReactNode;
}) {
  const [px, setPx] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed)
        ? Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, parsed))
        : defaultPx;
    } catch {
      return defaultPx;
    }
  });
  const dragRef = useRef<{ startX: number; startPx: number } | null>(null);

  function persist(next: number) {
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next)); } catch { /* best-effort */ }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startPx: px };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    // Sidebar is on the right, so dragging left expands it.
    const dx = dragRef.current.startX - e.clientX;
    const next = Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, dragRef.current.startPx + dx));
    setPx(next);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      persist(px);
      dragRef.current = null;
    }
    (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      className="hidden lg:flex shrink-0"
      style={{ width: `${px}px`, background: "var(--ow-bg-1)" }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le panneau"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="group shrink-0 flex items-center justify-center cursor-col-resize touch-none transition-colors hover:bg-[var(--ow-bg-2)]"
        style={{
          width: 12,
          borderLeft: "1px solid var(--ow-line)",
          borderRight: "1px solid var(--ow-line)",
        }}
      >
        <span
          className="block rounded-full transition-colors group-hover:bg-[var(--ow-accent)]"
          style={{ width: 4, height: 56, background: "var(--ow-fg-3)" }}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── PlanPage ──────────────────────────────────────────────────────────────────

export function PlanPage() {
  const mapRef = useRef<PlanMapHandle>(null);

  const { position: userPosition, status: geolocStatus, attempt: geolocAttempt, locate } = useGeolocation();
  const { view: mapView, onViewChange } = useMapView();
  // Zoom handed over by the explore map, used only when no route frames the
  // camera itself. Read once: navigating remounts the page.
  const [handedView] = useState(() => parseMapView(window.location.search));
  // On /plan the user is building a route, so a locate request is always
  // explicit: no first-visit auto-centering here.
  const handleLocate = useCallback(() => {
    locate().then((fix) => {
      if (fix) mapRef.current?.recenter(fix.lat, fix.lon);
    });
  }, [locate]);
  const drawerRef = useRef<DrawerHandle>(null);
  const initialParsed = parsePlanUrl(window.location.search);

  // If the URL is empty (typical after a /plan FAB click from the home page),
  // fall back to the cached last simulation so the user lands back on their
  // route + archetype + departure instead of an empty plan. Captured once at
  // mount so all useState initializers see the same snapshot.
  const urlHasWaypoints = isParsedOk(initialParsed) && initialParsed.waypoints.length >= 2;
  const cachedAtMount = !urlHasWaypoints ? loadLastSimulation() : null;
  const useCachedRoute = !!(cachedAtMount && cachedAtMount.waypoints.length >= 2);

  const [waypoints, setWaypoints] = useState<[number, number][]>(() => {
    if (urlHasWaypoints) return (initialParsed as { waypoints: [number, number][] }).waypoints;
    if (useCachedRoute) return cachedAtMount!.waypoints;
    return [];
  });
  const [archetype, setArchetype] = useState(() =>
    // A customized polar pins the boat to cfg.base — the hull the tuning was
    // built on and the one the selector displays — so a stale URL/cache slug
    // from an earlier session can't silently re-board the plan on another
    // boat (#220). Otherwise: URL, then cache, then the /config default.
    initialPlanBoat(
      loadPolarConfig(),
      isParsedOk(initialParsed) ? initialParsed.archetype : null,
      useCachedRoute ? cachedAtMount!.archetype : null,
    ),
  );
  const [departure, setDeparture] = useState(() => {
    const raw = isParsedOk(initialParsed) ? initialParsed.departure : "";
    if (raw && new Date(raw) >= new Date()) return raw;
    // Try cache: prefer the single-mode departure, then fall back to the
    // sweep's earliest timestamp so compare-only caches still seed the slider.
    const cachedDep =
      cachedAtMount?.single?.departure ?? cachedAtMount?.compare?.sweepEarliest;
    if (cachedDep && new Date(cachedDep) >= new Date()) return cachedDep;
    return tomorrowRoundedLocal();
  });
  const [timeAnchor, setTimeAnchor] = useState<TimeAnchor>("departure");

  const [passage, setPassage] = useState<PassageReport | null>(null);
  const [complexity, setComplexity] = useState<ComplexityScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Compare-windows mode (lifted from PlanSidebar in step 2)
  const [planMode, setPlanMode] = useState<"single" | "compare">(
    () => cachedAtMount?.mode ?? "single",
  );
  const [sweepEarliest, setSweepEarliest] = useState(
    () => cachedAtMount?.compare?.sweepEarliest ?? departure,
  );
  const [sweepLatest, setSweepLatest] = useState(() => {
    if (cachedAtMount?.compare?.sweepLatest) return cachedAtMount.compare.sweepLatest;
    const d = new Date(departure);
    d.setDate(d.getDate() + 2);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [sweepInterval, setSweepInterval] = useState<number>(
    () => cachedAtMount?.compare?.sweepIntervalHours ?? 3,
  );
  // Selected leg for the sidebar's expanded "Comment c'est calculé" — also
  // drives the highlight overlay on the map. Cleared whenever the route or
  // its segments change so we never highlight stale ranges.
  const [selectedLegIdx, setSelectedLegIdx] = useState<number | null>(null);
  useEffect(() => { setSelectedLegIdx(null); }, [waypoints, passage]);
  const [windows, setWindows] = useState<PassageWindow[] | null>(null);
  const [metaWarnings, setMetaWarnings] = useState<string[]>([]);
  // Compact "pick a mode" state on mobile: drops the sidebar to just the
  // mode pills + reset button (and shrinks the bottom drawer) until the
  // user actively confirms their mode choice. Initialised true when we
  // already have a route to display (cached / URL) so reload doesn't hide
  // the user's previous context.
  const [actionTaken, setActionTaken] = useState<boolean>(
    () => urlHasWaypoints || useCachedRoute,
  );
  // Reset to compact whenever the user drops back below 2 waypoints so the
  // next time they reach 2 they get the pick-a-mode step again.
  useEffect(() => {
    if (waypoints.length < 2) setActionTaken(false);
  }, [waypoints.length]);

  useEffect(() => {
    fetchArchetypes().then(setArchetypes).catch(() => {});
  }, []);

  // Fresh-results signal for the mobile drawer's fit-to-results behaviour
  // (see ResizableMobileDrawer). New identity whenever results land — fresh
  // fetch, window drill-down, cache hydration at mount — or the user toggles
  // between two filled modes, so the drawer re-fits on the view it switched
  // to. Gated on isLoading because setPassage/setWindows and
  // setIsLoading(false) can flush in separate renders — the filled view
  // (and its anchor) only exists once loading ends.
  const resultsFitKey = useMemo(() => {
    if (isLoading) return null;
    const filled = planMode === "compare" ? !!windows && windows.length > 0 : !!passage;
    return filled ? {} : null;
  }, [passage, windows, planMode, isLoading]);

  // Route edited after a result: the drawer content flips to the "Cliquez
  // sur Recalculer" placeholders while the results fit above may have left
  // the Recalculer bar scrolled out of view — bring it back.
  useEffect(() => {
    if (isStale) drawerRef.current?.scrollToTop();
  }, [isStale]);

  function doFetch(wpts: [number, number][], arch: string, dep: string, anchor: TimeAnchor = "departure") {
    setIsLoading(true);
    setApiError(null);
    const overrides = resolveOverrides();
    const depIso = toTzAware(dep);
    const anchorMs = Date.parse(depIso);
    // Sample the route corridor in the browser and attach it so the server
    // reads weather from this payload instead of calling Open-Meteo itself
    // (distributes the upstream load off the Space's single IP). On any
    // failure the cache is undefined and the server fetches live.
    const cacheWindow = anchor === "arrival"
      ? etaWindowMs(wpts, anchorMs)
      : singleWindowMs(wpts, anchorMs);
    const promise = buildForecastCacheSafe(wpts, { window: cacheWindow }).then((forecastCache) =>
      anchor === "arrival"
        ? fetchPassageByEta({ waypoints: wpts, targetArrival: depIso, archetype: arch, efficiency: resolveEfficiency(), overrides, forecastCache })
        : fetchPassage({ waypoints: wpts, departure: depIso, archetype: arch, efficiency: resolveEfficiency(), overrides, forecastCache })
    );
    promise
      .then((res) => {
        setPassage(res.passage);
        setComplexity(res.complexity);
        setForecastUpdatedAt(res.forecast_updated_at);
        setIsStale(false);
        // For URL/cache persistence, always use the resolved departure from the
        // returned passage (in ETA mode the user-typed `dep` is a target arrival,
        // not a departure — persisting it would break reload). The user-facing
        // slider keeps showing whatever they typed.
        const resolvedDep = isoToLocal(res.passage.departure_time);
        const url = buildPlanUrl(wpts, resolvedDep, arch);
        window.history.replaceState(null, "", url);
        const ttl = 7 * 24 * 3600;
        setCookie("ow_last_trip", window.location.href, ttl);
        // Persist for next visit. Merge into existing cache so a previously
        // saved compare-mode result stays available.
        const prev = loadLastSimulation();
        const sameRoute =
          prev && waypointsEqual(prev.waypoints, wpts) && prev.archetype === arch;
        saveLastSimulation({
          waypoints: wpts,
          archetype: arch,
          configFingerprint: currentConfigFingerprint(),
          mode: "single",
          single: {
            departure: resolvedDep,
            passage: res.passage,
            complexity: res.complexity,
            forecastUpdatedAt: res.forecast_updated_at,
          },
          compare: sameRoute ? prev?.compare : undefined,
          cachedAt: Date.now(),
        });
      })
      .catch((e: Error) => setApiError(friendlyError(e.message)))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Path A — URL has waypoints: respect the URL, restore from cache if it
    // matches the same route + boat, otherwise fetch fresh. The boat is the
    // seeded `archetype` state, not the raw URL slug: a customized polar
    // overrides the URL's boat (see initialPlanBoat), and the results shown
    // must be the ones computed on the boat the recap displays (#220).
    if (urlHasWaypoints) {
      const cached: LastSimulation | null = loadLastSimulation();
      const cacheMatches =
        cached &&
        waypointsEqual(cached.waypoints, initialParsed.waypoints) &&
        cached.archetype === archetype &&
        // Reject the cache if the user tweaked /config since the simulation
        // ran — the persisted result is stale relative to the active
        // preferences. Treat missing fingerprint as "pre-config-era" cache.
        cached.configFingerprint === currentConfigFingerprint();
      if (cacheMatches) {
        if (cached.single && cached.single.departure === departure) {
          setPassage(cached.single.passage);
          setComplexity(cached.single.complexity);
          setForecastUpdatedAt(cached.single.forecastUpdatedAt);
        }
        // Always restore compare-mode windows + sweep params if present —
        // sweep range isn't encoded in the URL, so we trust the cache.
        if (cached.compare) {
          setWindows(cached.compare.windows);
          setMetaWarnings(cached.compare.metaWarnings);
          if (!cached.single || cached.single.departure !== departure) {
            setForecastUpdatedAt(cached.compare.forecastUpdatedAt);
          }
        }
        if (cached.single || cached.compare) return;
      }
      doFetch(initialParsed.waypoints, archetype, departure);
      return;
    }

    // Path B — URL is empty: state was already seeded from cache by the
    // useState initializers above. Hydrate the simulation results, sync the
    // URL so reload/share works, and skip any network call.
    if (useCachedRoute && cachedAtMount) {
      const url = buildPlanUrl(cachedAtMount.waypoints, departure, archetype);
      window.history.replaceState(null, "", url);
      // Discard the persisted results and refetch when /config changed since
      // the cache was written, or when the cached simulation ran on another
      // boat than the seeded one (a customized polar re-pins the boat to its
      // base — the cached run may predate the fix for #220). Route + boat +
      // departure remain seeded.
      if (
        cachedAtMount.configFingerprint !== currentConfigFingerprint() ||
        cachedAtMount.archetype !== archetype
      ) {
        doFetch(cachedAtMount.waypoints, archetype, departure);
        return;
      }
      if (cachedAtMount.single) {
        setPassage(cachedAtMount.single.passage);
        setComplexity(cachedAtMount.single.complexity);
        setForecastUpdatedAt(cachedAtMount.single.forecastUpdatedAt);
      }
      if (cachedAtMount.compare) {
        setWindows(cachedAtMount.compare.windows);
        setMetaWarnings(cachedAtMount.compare.metaWarnings);
        if (!cachedAtMount.single) {
          setForecastUpdatedAt(cachedAtMount.compare.forecastUpdatedAt);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Functional updaters avoid stale closure when clicks happen fast
  function handleMapClick(lat: number, lon: number) {
    setWaypoints((prev) => [...prev, [lat, lon]]);
    // Appending a point edits the route just like a drag/insert — mark results
    // stale so a prior single/compare run can't linger as if it still matched.
    // (No-op visually before the first computation, when there's nothing yet.)
    setIsStale(true);
  }

  function handleWptMove(idx: number, lat: number, lon: number) {
    setWaypoints((prev) => prev.map((wp, i): [number, number] => (i === idx ? [lat, lon] : wp)));
    setIsStale(true);
  }

  function handleWptAdd(afterIdx: number, lat: number, lon: number) {
    setWaypoints((prev) => {
      const next = [...prev];
      next.splice(afterIdx + 1, 0, [lat, lon]);
      return next;
    });
    setIsStale(true);
  }

  function handleWptDelete(idx: number) {
    setWaypoints((prev) => prev.filter((_, i) => i !== idx));
    setIsStale(true);
  }

  function handleArchetypeChange(slug: string) {
    setArchetype(slug);
    const cfg = loadPolarConfig();
    if (isPolarCustomized(cfg)) {
      // Perso stays defined: picking a stock hull just parks it for planning
      // (no matrix push, the server's bundled polar wins). The tuning is kept
      // untouched so the « Perso » entry of the selector brings it back.
      savePolarConfig({ ...cfg, persoActive: false });
    } else {
      // Write through to /config: one boat for the whole app.
      savePolarConfig({ ...cfg, base: slug, source: "archetype" });
    }
    setIsStale(true);
  }

  // Selecting the « Perso » entry of the boat list: reactivate the
  // customization and re-pin the page's slug to the grid it was built on.
  function handlePersoSelect() {
    const cfg = loadPolarConfig();
    savePolarConfig({ ...cfg, persoActive: true });
    setArchetype(cfg.base);
    setIsStale(true);
  }

  function handleDepartureChange(iso: string) {
    setDeparture(iso);
    setIsStale(true);
  }

  function handleRefetch() {
    // Re-frame the camera on the route only now, at the user's explicit
    // request — the map no longer auto-fits on each waypoint placement.
    mapRef.current?.fitToWaypoints();
    doFetch(waypoints, archetype, departure, timeAnchor);
  }

  function handleTimeAnchorChange(next: TimeAnchor) {
    if (next === timeAnchor) return;
    setTimeAnchor(next);
    setIsStale(true);
  }

  function doFetchWindows() {
    mapRef.current?.fitToWaypoints();
    setIsLoading(true);
    setApiError(null);
    const earliestIso = toTzAware(sweepEarliest);
    const latestIso = toTzAware(sweepLatest);
    const cacheWindow = sweepWindowMs(waypoints, Date.parse(earliestIso), Date.parse(latestIso));
    buildForecastCacheSafe(waypoints, { window: cacheWindow })
      .then((forecastCache) =>
        fetchPassageWindows({
          waypoints,
          earliest: earliestIso,
          latest: latestIso,
          archetype,
          intervalHours: sweepInterval,
          efficiency: resolveEfficiency(),
          overrides: resolveOverrides(),
          forecastCache,
        }),
      )
      .then((res) => {
        setWindows(res.windows);
        setMetaWarnings(res.meta_warnings);
        setForecastUpdatedAt(res.forecast_updated_at);
        // Don't clear single-mode results — render gates on `mode` instead.
        setIsStale(false);
        // Persist for next visit. Merge with existing single-mode cache if
        // the route still matches.
        const prev = loadLastSimulation();
        const sameRoute =
          prev && waypointsEqual(prev.waypoints, waypoints) && prev.archetype === archetype;
        saveLastSimulation({
          waypoints,
          archetype,
          configFingerprint: currentConfigFingerprint(),
          mode: "compare",
          single: sameRoute ? prev?.single : undefined,
          compare: {
            sweepEarliest,
            sweepLatest,
            sweepIntervalHours: sweepInterval,
            windows: res.windows,
            metaWarnings: res.meta_warnings,
            forecastUpdatedAt: res.forecast_updated_at,
          },
          cachedAt: Date.now(),
        });
      })
      .catch((e: Error) => setApiError(friendlyError(e.message)))
      .finally(() => setIsLoading(false));
  }

  function handleReset() {
    setActionTaken(false);
    clearLastSimulation();
    // Also expire the dormant ow_last_trip cookie so a future read (if we ever
    // wire it up) doesn't resurrect a stale plan.
    clearCookie("ow_last_trip");
    setWaypoints([]);
    setPassage(null);
    setComplexity(null);
    setWindows(null);
    setMetaWarnings([]);
    setApiError(null);
    setIsStale(false);
    setSelectedLegIdx(null);
    setForecastUpdatedAt(null);
    setPlanMode("single");
    setTimeAnchor("departure");
    setArchetype(loadPolarConfig().base);
    const dep = tomorrowRoundedLocal();
    setDeparture(dep);
    setSweepEarliest(dep);
    const d = new Date(dep);
    d.setDate(d.getDate() + 2);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSweepLatest(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setSweepInterval(3);
    window.history.replaceState(null, "", "/plan");
  }

  function handleModeChange(next: "single" | "compare") {
    // Any pill click confirms the user's intent — even re-clicking the
    // already-active mode unlocks the compact "pick-a-mode" view on mobile.
    setActionTaken(true);
    if (next === planMode) return;
    setPlanMode(next);
    setApiError(null);
    // Don't clear opposite-mode results: keeping `passage` and `windows`
    // both in memory lets the user toggle back and forth without re-fetching.
    // The render branches gate on `mode` so stale data never leaks visually.
  }

  // Drill-down from the compare-windows table: pick a window → switch to
  // single mode with that window's departure pre-filled.
  // Fast path: the sweep response already includes `passage` and
  // `complexity_full` per window — hydrate state directly, zero re-fetch.
  // Fallback: older HF Space deployments don't include those fields → call
  // doFetch as before so the UX still works during deployment lag.
  function handleWindowSelect(w: PassageWindow) {
    const d = new Date(w.departure);
    const pad = (n: number) => String(n).padStart(2, "0");
    const naiveDep = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setPlanMode("single");
    setDeparture(naiveDep);
    setMetaWarnings([]);
    setApiError(null);

    if (w.passage && w.complexity_full) {
      // Hydrate from the in-memory window — instant.
      setPassage(w.passage);
      setComplexity(w.complexity_full);
      setIsLoading(false);
      setIsStale(false);
      // Update URL + cookie so reload restores the same view.
      const url = buildPlanUrl(waypoints, naiveDep, archetype);
      window.history.replaceState(null, "", url);
      const ttl = 7 * 24 * 3600;
      setCookie("ow_last_trip", window.location.href, ttl);
      // Keep windows around so the user can switch back to compare mode and
      // see the table again without re-fetching the sweep.
      // setWindows(null) intentionally NOT called — user toggling back to
      // compare should see their table immediately.
      // Persist: same route → keep compare data, overwrite single with the
      // freshly-picked window, flip mode back to single.
      const prev = loadLastSimulation();
      const sameRoute =
        prev && waypointsEqual(prev.waypoints, waypoints) && prev.archetype === archetype;
      saveLastSimulation({
        waypoints,
        archetype,
        // Inherit the fingerprint from the compare-mode cache that produced
        // this window — drill-down is metadata reshuffling, not a new run.
        configFingerprint: prev?.configFingerprint ?? currentConfigFingerprint(),
        mode: "single",
        single: {
          departure: naiveDep,
          passage: w.passage,
          complexity: w.complexity_full,
          forecastUpdatedAt: forecastUpdatedAt ?? "",
        },
        compare: sameRoute ? prev?.compare : undefined,
        cachedAt: Date.now(),
      });
    } else {
      // Backwards-compatible fallback: re-fetch.
      setWindows(null);
      doFetch(waypoints, archetype, naiveDep);
    }
  }

  if (!isParsedOk(initialParsed)) {
    return (
      <div
        className="h-dvh flex flex-col items-center justify-center px-6"
        style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
      >
        <div className="max-w-sm text-center space-y-4">
          <p className="text-4xl">⚓</p>
          <h1 className="text-xl font-bold">URL invalide</h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>{initialParsed.error}</p>
          <a
            href={`/${mapViewQuery(mapView)}`}
            className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: "var(--ow-accent)", color: "#fff" }}
          >
            ← Explorer la météo
          </a>
        </div>
      </div>
    );
  }

  // Single source of truth for PlanSidebar's props — spread into both the
  // desktop and mobile renders below so they can't silently drift apart.
  const sidebarProps = {
    passage,
    complexity,
    isLoading,
    error: apiError,
    archetypes,
    currentArchetypeSlug: archetype,
    onArchetypeChange: handleArchetypeChange,
    onPersoSelect: handlePersoSelect,
    departure,
    onDepartureChange: handleDepartureChange,
    isStale,
    onRefetch: handleRefetch,
    forecastUpdatedAt,
    waypointCount: waypoints.length,
    waypoints,
    timeAnchor,
    onTimeAnchorChange: handleTimeAnchorChange,
    mode: planMode,
    onModeChange: handleModeChange,
    sweepEarliest,
    sweepLatest,
    sweepIntervalHours: sweepInterval,
    onSweepEarliestChange: setSweepEarliest,
    onSweepLatestChange: setSweepLatest,
    onSweepIntervalChange: setSweepInterval,
    windows,
    metaWarnings,
    onCompareFetch: doFetchWindows,
    onWindowSelect: handleWindowSelect,
    selectedLegIdx,
    onSelectedLegChange: setSelectedLegIdx,
    onReset: handleReset,
    actionTaken,
  };

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
    >
      {/* On the planner the route being drawn is the strongest statement of
          where the user is working, so the first waypoint outranks the GPS
          fix as the search reference. */}
      <Header
        onSelectSpot={(spot) => mapRef.current?.recenter(spot.latitude, spot.longitude)}
        nearLat={waypoints[0]?.[0] ?? userPosition?.lat ?? mapView?.lat ?? null}
        nearLon={waypoints[0]?.[1] ?? userPosition?.lon ?? mapView?.lon ?? null}
      />

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Map — full height on mobile, flex-1 on desktop */}
        <div className="flex-1 min-h-0 relative">
          <PlanMap
            ref={mapRef}
            waypoints={waypoints}
            // Only feed the condition-colored segments in single mode. In
            // compare mode there's no single "the conditions" to color by (each
            // window differs), and `passage` lags the route once it's edited
            // there — drawing its stale segments left earlier waypoints floating
            // off a route that no longer matched the markers (#152 follow-up).
            // Compare mode falls back to a neutral line through the live
            // waypoints, so the drawn route always matches what's computed.
            segments={planMode === "single" ? passage?.segments : undefined}
            isStale={isStale}
            onWptMove={handleWptMove}
            onWptAdd={waypoints.length >= 2 ? handleWptAdd : undefined}
            onWptDelete={handleWptDelete}
            onMapClick={handleMapClick}
            initialCenter={isParsedOk(initialParsed) ? initialParsed.center : null}
            userPosition={userPosition}
            onViewChange={onViewChange}
            initialZoom={handedView?.zoom ?? null}
            highlightedSegmentRange={
              selectedLegIdx != null && passage
                ? computeLegSegmentRanges(passage.segments as { start: { lat: number; lon: number } }[], waypoints)[selectedLegIdx] ?? null
                : null
            }
          />
          {/* Back-to-explore FAB — mirrors the compass FAB on the home map */}
          <a
            href={`/${mapViewQuery(mapView)}`}
            className="absolute top-3 left-3 z-[400] w-[58px] h-[58px] sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: "var(--ow-accent)", color: "#fff" }}
            title="Retour à l'exploration"
          >
            <img src="/wind-icon.png" alt="" className="select-none w-[64px] h-[64px] sm:w-[88px] sm:h-[88px]" draggable={false} />
          </a>
          {/* Locate FAB — bottom right of the map container, which shrinks as
              the mobile drawer is dragged up, so the button follows it.
              Normally 16 px above the drawer edge, the reference gap reused
              on the home overlay. On mobile the hero stats take that corner,
              so the button clears their 72 px and keeps the same 16 px above
              them rather than sitting on the arrival time. */}
          <LocateButton
            status={geolocStatus}
            attempt={geolocAttempt}
            onClick={handleLocate}
            className={
              passage && planMode === "single" && !isStale
                ? "bottom-[5.5rem] lg:bottom-4 right-3"
                : "bottom-4 right-3"
            }
          />
          {/* Hint overlay while building the route */}
          {waypoints.length < 2 && (
            <div className="absolute inset-x-4 bottom-4 z-[400] flex justify-center pointer-events-none">
              <div
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--ow-surface-glass)", backdropFilter: "blur(8px)", border: "1px solid var(--ow-line-2)", color: "var(--ow-fg-1)" }}
              >
                {waypoints.length === 0 ? "Cliquez pour placer le départ" : "Cliquez pour tracer votre route"}
              </div>
            </div>
          )}
          {/* Hero stats overlay — mobile only, single-mode results.
              Hidden as soon as the route was edited without recalculating:
              stale totals would contradict the "Recalculer" hint in the
              drawer. Complexity is read from the colored route itself. */}
          {passage && planMode === "single" && !isStale && (
            <div className="lg:hidden absolute bottom-2 left-2 right-2 z-[400] pointer-events-none">
              <PlanHeroStats passage={passage} onOpen={() => drawerRef.current?.expand()} />
            </div>
          )}
        </div>

        {/* Desktop sidebar — user-resizable via the handle on the left edge. */}
        <ResizableDesktopSidebar defaultPx={384}>
          <PlanSidebar {...sidebarProps} />
        </ResizableDesktopSidebar>
      </div>

      {/* Mobile drawer — below map. Auto-slides to a target height based on
          where the user is in the flow (no waypoints → minimal so the map
          stays the focus; 2 waypoints → tall enough to surface just the
          mode pills; mode confirmed → full content height). The drag handle
          still lets the user override at any time. */}
      <ResizableMobileDrawer
        ref={drawerRef}
        defaultVh={passage ? 38 : 60}
        targetVh={
          waypoints.length < 2
            ? 18
            : !actionTaken
              ? 22
              : 65
        }
        resultsFitKey={resultsFitKey}
      >
        <PlanSidebar {...sidebarProps} />
      </ResizableMobileDrawer>
    </div>
  );
}
