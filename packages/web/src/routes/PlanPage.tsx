import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { parsePlanUrl, isParsedOk, buildPlanUrl } from "../plan/parseUrl";
import { PlanMap, type PlanMapHandle } from "../plan/PlanMap";
import { PlanSidebar } from "../plan/PlanSidebar";
import { fetchPassage, fetchPassageByEta, fetchPassageWindows, fetchArchetypes, friendlyError, type PlanOverrides } from "../api/passage";
import { Header } from "../components/Header";
import type { PassageReport, ComplexityScore, Archetype, PassageWindow } from "../plan/types";
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
import { effectivePolar, isPolarCustomized, loadPolarConfig, polarFingerprint } from "../config/polarConfig";

// Build the plan-time overrides payload from current /config preferences.
// Read at request time (not at mount) so a /config tweak takes effect on the
// next refetch without a page reload. Polar matrix is only attached when the
// editor deviates from the default for the active archetype — otherwise the
// server's bundled polar wins, saving ~kB per request.
function resolveOverrides(archetype: string): PlanOverrides {
  const overrides: PlanOverrides = {};
  const modelCfg = loadModelConfig();
  const models = activeModels(modelCfg);
  if (models.length > 0) overrides.models = models;
  const polarCfg = loadPolarConfig();
  if (isPolarCustomized(polarCfg, archetype)) {
    overrides.polar = effectivePolar(polarCfg);
  }
  return overrides;
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
function fmtDuration(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// Hero stats overlay — absolute, bottom of map, mobile only.
// 3 tiles (ETA / Durée / Dist) — complexity is conveyed by the segment color
// of the route on the map itself.
function PlanHeroStats({ passage }: { passage: PassageReport }) {
  const stats = [
    { label: "ETA", value: fmtTime(passage.arrival_time) },
    { label: "Durée", value: fmtDuration(passage.duration_h) },
    { label: "Dist", value: `${passage.distance_nm.toFixed(1)} nm` },
  ];
  return (
    <div className="flex gap-1.5">
      {stats.map(({ label, value }) => (
        <div
          key={label}
          className="flex-1 rounded-xl px-2 py-1.5 text-center"
          style={{ background: "var(--ow-surface-glass)", backdropFilter: "blur(8px)", border: "1px solid var(--ow-line-2)" }}
        >
          <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--ow-fg-2)" }}>{label}</div>
          <div className="text-xs font-bold tabular-nums leading-tight mt-0.5" style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}>{value}</div>
        </div>
      ))}
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
}

const ResizableMobileDrawer = forwardRef<DrawerHandle, {
  defaultVh: number;
  children: React.ReactNode;
}>(function ResizableMobileDrawer({ defaultVh, children }, ref) {
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

  function persist(next: number) {
    try { localStorage.setItem(DRAWER_HEIGHT_KEY, String(next)); } catch { /* best-effort */ }
  }

  useImperativeHandle(ref, () => ({
    expand: () => {
      setVh((prev) => {
        const next = Math.max(prev, DRAWER_EXPANDED_VH);
        if (next !== prev) persist(next);
        return next;
      });
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
      className="lg:hidden shrink-0 overflow-y-auto border-t flex flex-col"
      style={{ height: `${vh}vh`, background: "var(--ow-bg-1)", borderColor: "var(--ow-line)" }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionner le panneau"
        onPointerDown={onPointerDown}
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
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
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
  const [archetype, setArchetype] = useState(() => {
    if (isParsedOk(initialParsed) && initialParsed.archetype) return initialParsed.archetype;
    if (useCachedRoute) return cachedAtMount!.archetype;
    return "cruiser_30ft";
  });
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

  useEffect(() => {
    fetchArchetypes().then(setArchetypes).catch(() => {});
  }, []);

  function doFetch(wpts: [number, number][], arch: string, dep: string, anchor: TimeAnchor = "departure") {
    setIsLoading(true);
    setApiError(null);
    const overrides = resolveOverrides(arch);
    const promise = anchor === "arrival"
      ? fetchPassageByEta({ waypoints: wpts, targetArrival: toTzAware(dep), archetype: arch, overrides })
      : fetchPassage({ waypoints: wpts, departure: toTzAware(dep), archetype: arch, overrides });
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
        document.cookie = `ow_last_trip=${encodeURIComponent(window.location.href)};max-age=${ttl};path=/;SameSite=Lax`;
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
    // matches the same route + archetype, otherwise fetch fresh.
    if (urlHasWaypoints) {
      const cached: LastSimulation | null = loadLastSimulation();
      const cacheMatches =
        cached &&
        waypointsEqual(cached.waypoints, initialParsed.waypoints) &&
        cached.archetype === initialParsed.archetype &&
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
      doFetch(initialParsed.waypoints, initialParsed.archetype, departure);
      return;
    }

    // Path B — URL is empty: state was already seeded from cache by the
    // useState initializers above. Hydrate the simulation results, sync the
    // URL so reload/share works, and skip any network call.
    if (useCachedRoute && cachedAtMount) {
      const url = buildPlanUrl(cachedAtMount.waypoints, departure, cachedAtMount.archetype);
      window.history.replaceState(null, "", url);
      // /config changed since the cache was written — discard the persisted
      // results and refetch so the plan reflects the user's current
      // preferences. Route + archetype + departure remain seeded.
      if (cachedAtMount.configFingerprint !== currentConfigFingerprint()) {
        doFetch(cachedAtMount.waypoints, cachedAtMount.archetype, departure);
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
    setIsStale(true);
  }

  function handleDepartureChange(iso: string) {
    setDeparture(iso);
    setIsStale(true);
  }

  function handleRefetch() {
    doFetch(waypoints, archetype, departure, timeAnchor);
  }

  function handleTimeAnchorChange(next: TimeAnchor) {
    if (next === timeAnchor) return;
    setTimeAnchor(next);
    setIsStale(true);
  }

  function doFetchWindows() {
    setIsLoading(true);
    setApiError(null);
    fetchPassageWindows({
      waypoints,
      earliest: toTzAware(sweepEarliest),
      latest: toTzAware(sweepLatest),
      archetype,
      intervalHours: sweepInterval,
      overrides: resolveOverrides(archetype),
    })
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
    clearLastSimulation();
    // Also expire the dormant ow_last_trip cookie so a future read (if we ever
    // wire it up) doesn't resurrect a stale plan.
    document.cookie = "ow_last_trip=;max-age=0;path=/;SameSite=Lax";
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
    setArchetype("cruiser_30ft");
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
      document.cookie = `ow_last_trip=${encodeURIComponent(window.location.href)};max-age=${ttl};path=/;SameSite=Lax`;
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
        className="h-screen flex flex-col items-center justify-center px-6"
        style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
      >
        <div className="max-w-sm text-center space-y-4">
          <p className="text-4xl">⚓</p>
          <h1 className="text-xl font-bold">URL invalide</h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>{initialParsed.error}</p>
          <a
            href="/"
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
    onExpandDrawer: () => drawerRef.current?.expand(),
    onReset: handleReset,
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
    >
      <Header
        onSelectSpot={(spot) => mapRef.current?.recenter(spot.latitude, spot.longitude)}
      />

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Map — full height on mobile, flex-1 on desktop */}
        <div className="flex-1 min-h-0 relative">
          <PlanMap
            ref={mapRef}
            waypoints={waypoints}
            segments={passage?.segments}
            isStale={isStale}
            onWptMove={handleWptMove}
            onWptAdd={waypoints.length >= 2 ? handleWptAdd : undefined}
            onWptDelete={handleWptDelete}
            onMapClick={handleMapClick}
            highlightedSegmentRange={
              selectedLegIdx != null && passage
                ? computeLegSegmentRanges(passage.segments as { start: { lat: number; lon: number } }[], waypoints)[selectedLegIdx] ?? null
                : null
            }
          />
          {/* Back-to-explore FAB — mirrors the compass FAB on the home map */}
          <a
            href="/"
            className="absolute top-3 left-3 z-[400] w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: "var(--ow-accent)", color: "#fff" }}
            title="Retour à l'exploration"
          >
            <img src="/wind-icon.png" alt="" width="88" height="88" className="select-none" draggable={false} />
          </a>
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
              3 tiles (ETA / Durée / Dist). Complexity is read from the
              colored route on the map itself. */}
          {passage && planMode === "single" && (
            <div className="lg:hidden absolute bottom-2 left-2 right-2 z-[400] pointer-events-none">
              <PlanHeroStats passage={passage} />
            </div>
          )}
        </div>

        {/* Desktop sidebar — user-resizable via the handle on the left edge. */}
        <ResizableDesktopSidebar defaultPx={384}>
          <PlanSidebar {...sidebarProps} />
        </ResizableDesktopSidebar>
      </div>

      {/* Mobile drawer — below map. User-resizable via the handle bar at the top. */}
      <ResizableMobileDrawer ref={drawerRef} defaultVh={passage ? 38 : 60}>
        <PlanSidebar {...sidebarProps} />
      </ResizableMobileDrawer>
    </div>
  );
}
