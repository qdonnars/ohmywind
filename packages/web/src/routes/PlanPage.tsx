// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { parsePlanUrl, buildPlanUrl } from "../plan/parseUrl";
import { PlanMap, type PlanMapHandle } from "../plan/PlanMap";
import { PlanSidebar } from "../plan/PlanSidebar";
import { fetchArchetypes } from "../api/passage";
import { Header } from "../components/Header";
import { NavMenu } from "../components/NavMenu";
import type { Archetype } from "../plan/types";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { StatBand } from "../plan/PlanStates";
import { loadPlanDraft } from "../plan/draft";
import { loadLastSimulation } from "../plan/lastSimulation";
import { resolveInitialSession, type InitialSession } from "../plan/session/initial";
import { usePlanSession, currentConfigFingerprint } from "../plan/session/usePlanSession";
import { PlanProvider } from "../plan/session/PlanProvider";
import { computeLegSegmentRanges, focusedSegmentIndex } from "../plan/aggregateLegs";
import { loadPolarConfig } from "../config/polarConfig";
import { LocateButton } from "../components/LocateButton";
import { SeamarkButton } from "../components/SeamarkButton";
import { useSeamarks } from "../hooks/useSeamarks";
import { useWaypointDepths } from "../hooks/useWaypointDepths";
import { useGeolocation } from "../hooks/useGeolocation";
import { useBackDismiss } from "../hooks/useBackDismiss";
import { useMapView } from "../hooks/useMapView";
import { LG_MEDIA_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { parseMapView, mapViewQuery } from "../utils/mapViewParams";
import { navigate } from "../navigation";
import { useT } from "../i18n";

// ── ResizableMobileDrawer ────────────────────────────────────────────────────
// User-resizable bottom drawer: a 4 px grab-handle at the top responds to
// pointer drag (mouse or touch) and adjusts the drawer height in vh. The
// chosen height persists in localStorage so reload feels stable.

const DRAWER_HEIGHT_KEY = LOCAL_STORAGE_KEYS.drawerHeight;
const DRAWER_MIN_VH = 12;
const DRAWER_MAX_VH = 90;

interface DrawerHandle {
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
  /** Rendered in the drawer chrome, between the grab handle and the
   *  scrolling content, so it never scrolls away: the totals band of a
   *  computed passage. Counted with the handle in the fit-to-results
   *  measure, since both take their height from the drawer, not from the
   *  content below the anchor. */
  head?: React.ReactNode;
  children: React.ReactNode;
}>(function ResizableMobileDrawer({ defaultVh, targetVh, resultsFitKey, head, children }, ref) {
  const { t } = useT();
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
  //
  // Adjusted while rendering rather than from an effect: the target is a
  // function of where the user stands in the flow, so an effect meant
  // painting the previous height first and only then the right one. React
  // re-runs this render before committing anything, so nothing flashes.
  const [appliedTarget, setAppliedTarget] = useState<number | null>(null);
  if (targetVh != null && targetVh !== appliedTarget) {
    setAppliedTarget(targetVh);
    setVh(Math.max(DRAWER_MIN_VH, Math.min(DRAWER_MAX_VH, targetVh)));
    setIsAnimating(true);
  }

  // One timer for every animated height change, wherever it came from: the
  // transition is 280 ms, the flag is dropped a beat later so a user drag
  // starting right after still feels direct.
  useEffect(() => {
    if (!isAnimating) return;
    const t = setTimeout(() => setIsAnimating(false), 320);
    return () => clearTimeout(t);
  }, [isAnimating]);

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
      if (outer.offsetHeight === 0) return; // nothing measurable yet
      const anchorTop =
        anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      // Real content extent, NOT container.scrollHeight — scrollHeight is
      // floored at clientHeight, so when the content is shorter than the
      // drawer it would count the empty space and the fit would stop short.
      const contentEnd = container.lastElementChild?.getBoundingClientRect().bottom
        ?? container.getBoundingClientRect().bottom;
      const belowPx = contentEnd - anchor.getBoundingClientRect().top;
      const chromePx = outer.offsetHeight - container.clientHeight; // grab handle + head + border
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
      className="shrink-0 overflow-y-auto border-t flex flex-col"
      style={{
        height: `${vh}vh`,
        background: "var(--ow-bg-1)",
        borderColor: "var(--ow-line)",
        transition: isAnimating ? "height 280ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
      }}
    >
      {/* Grab handle. 28 px of full-width strip rather than the 14 px this
          shipped with: at 14 px the target was under half a fingertip and
          users reported missing it outright. The handle sits flush against
          the map, so the hit area cannot be widened with a negative margin
          (the drawer is overflow-y-auto and would clip it) — the strip itself
          has to carry the height. It stays under the 44 px touch guideline on
          purpose: at DRAWER_MIN_VH the drawer is a peek, and a 44 px handle
          would eat most of it. `chromePx` in the fit-to-results effect reads
          the height from the DOM, so nothing else needs updating. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("plan.panel.resize")}
        onPointerDown={(e) => { setIsAnimating(false); onPointerDown(e); }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 flex items-center justify-center cursor-row-resize touch-none"
        style={{ height: 28, background: "var(--ow-bg-1)" }}
      >
        <span
          className="block rounded-full"
          style={{ width: 44, height: 5, background: "var(--ow-line-2)" }}
        />
      </div>
      {head}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
});

// ── ResizableDesktopSidebar ──────────────────────────────────────────────────
// Desktop equivalent of ResizableMobileDrawer: vertical grab-handle on the left
// edge adjusts width in px. Persists in localStorage so reload feels stable.
// Useful when comparing windows — the 7-column table is cramped at 320–384 px.

const SIDEBAR_WIDTH_KEY = LOCAL_STORAGE_KEYS.sidebarWidth;
const SIDEBAR_MIN_PX = 280;
const SIDEBAR_MAX_PX = 800;

function ResizableDesktopSidebar({
  defaultPx,
  children,
}: {
  defaultPx: number;
  children: React.ReactNode;
}) {
  const { t } = useT();
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
      className="flex shrink-0"
      style={{ width: `${px}px`, background: "var(--ow-bg-1)" }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("plan.panel.resize")}
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
  const { t } = useT();
  const mapRef = useRef<PlanMapHandle>(null);

  const { position: userPosition, status: geolocStatus, attempt: geolocAttempt, locate } = useGeolocation();
  const { view: mapView, onViewChange } = useMapView();
  // Which of the two panel layouts to mount. Same breakpoint the CSS uses, so
  // React and Tailwind can never disagree about which one is on screen.
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const { enabled: seamarks, toggle: toggleSeamarks } = useSeamarks("plan");
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

  // Everything the three persistence media (this tab's draft, the URL, the
  // cached last simulation) have to say about the page, decided once, in one
  // pure place. `plan/session/initial.ts` carries the precedence table and the
  // freshness rules.
  const [initial] = useState<InitialSession>(() =>
    resolveInitialSession({
      url: parsePlanUrl(window.location.search),
      draft: loadPlanDraft(),
      cache: loadLastSimulation(),
      polarConfig: loadPolarConfig(),
      configFingerprint: currentConfigFingerprint(),
      now: Date.now(),
    }),
  );

  // The whole domain state of the planner, plus the two computations and the
  // single effect that persists. See plan/session/reducer.ts.
  const { state, actions, isLoading } = usePlanSession(initial);
  // The page itself only needs what the map and the drawer are built on; the
  // panel reads everything else from the context below.
  const { waypoints, passage, windows, mode: planMode, selectedLegIdx, selectedStepIdx, actionTaken, isStale } = state;

  const waypointDepths = useWaypointDepths(waypoints);
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);

  // Back collapses the open leg rather than leaving the planner (issue #300).
  const collapseLeg = useCallback(() => actions.selectLeg(null), [actions]);
  useBackDismiss(selectedLegIdx !== null, collapseLeg);

  useEffect(() => {
    fetchArchetypes().then(setArchetypes).catch(() => {});
  }, []);

  // Fresh-results signal for the mobile drawer's fit-to-results behaviour
  // (see ResizableMobileDrawer). New identity whenever results land — fresh
  // fetch, window drill-down, cache hydration at mount — or the user toggles
  // between two filled modes, so the drawer re-fits on the view it switched
  // to. Gated on isLoading because the filled view (and its anchor) only
  // exists once loading ends.
  const resultsFitKey = useMemo(() => {
    if (isLoading) return null;
    const filled = planMode === "compare" ? !!windows && windows.length > 0 : !!passage;
    return filled ? {} : null;
  }, [passage, windows, planMode, isLoading]);

  // Memoised: PlanMap keys an effect on this tuple, and a fresh one on every
  // render made it destroy and redraw the highlight polyline each time a
  // slider ticked.
  const legRanges = useMemo(
    () => (passage ? computeLegSegmentRanges(passage.segments, waypoints) : []),
    [passage, waypoints],
  );
  const highlightedSegmentRange = useMemo(
    () => (selectedLegIdx != null ? legRanges[selectedLegIdx] ?? null : null),
    [selectedLegIdx, legRanges],
  );
  // The step open in the panel, as an index into the passage's segments.
  const focusedSegmentIdx = focusedSegmentIndex(legRanges, selectedLegIdx, selectedStepIdx);

  // Route edited after a result: the drawer content flips to the "Cliquez
  // sur Recalculer" placeholders while the results fit above may have left
  // the Recalculer bar scrolled out of view — bring it back.
  useEffect(() => {
    if (isStale) drawerRef.current?.scrollToTop();
  }, [isStale]);

  // Everything the resolved session could seed synchronously already is, in
  // `createInitialState`. What is left needs the outside world: syncing the
  // address bar when the cache supplied the route (so reload and share work),
  // and computing when nothing usable could be restored.
  useEffect(() => {
    if (initial.mount.rewriteUrl) {
      // Through the router, not through `history` directly: this rewrite
      // happens on the page the reader is already on, and a router left
      // holding the previous URL remounted the planner at the next back
      // press, results and all.
      navigate(
        buildPlanUrl(initial.waypoints, initial.departure, initial.archetype),
        { replace: true },
      );
    }
    if (initial.mount.fetch) actions.compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The camera frames the route only at the user's explicit request
  // (Calculer / Comparer), never on a waypoint placement. The frame itself is
  // taken once the results are on screen rather than when the request is
  // made: on mobile the drawer fits itself to the results in the frame they
  // land (see ResizableMobileDrawer), so a fit taken at request time was
  // measured on a map the drawer then resized under it, and the route ended
  // up hidden or off-centre (#392). The flag carries the request across the
  // fetch; a results identity that changes for another reason (mode toggle,
  // window drill-down, cache hydration at mount) leaves the camera alone.
  const frameOnResultsRef = useRef(false);

  const handleRefetch = useCallback(() => {
    frameOnResultsRef.current = true;
    actions.compute();
  }, [actions]);

  const handleCompareFetch = useCallback(() => {
    frameOnResultsRef.current = true;
    actions.computeWindows();
  }, [actions]);

  useEffect(() => {
    if (resultsFitKey == null || !frameOnResultsRef.current) return;
    frameOnResultsRef.current = false;
    // One frame later, like the drawer's own fit: the two run in the order
    // they were scheduled, the drawer's first, so the map is measured at the
    // height the drawer settled on.
    const raf = requestAnimationFrame(() => mapRef.current?.fitToWaypoints());
    return () => cancelAnimationFrame(raf);
  }, [resultsFitKey]);

  if (initial.urlError !== null) {
    return (
      <div
        className="h-dvh flex flex-col items-center justify-center px-6"
        style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-0)" }}
      >
        <div className="max-w-sm text-center space-y-4">
          <p className="text-4xl">⚓</p>
          <h1 className="text-xl font-bold">{t("plan.page.urlError.title")}</h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>{initial.urlError}</p>
          <a
            href={`/${mapViewQuery(mapView)}`}
            className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: "var(--ow-accent)", color: "var(--ow-on-accent)" }}
          >
            {t("plan.page.urlError.back")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <PlanProvider
      value={{ state, actions, archetypes, isLoading, compute: handleRefetch, computeWindows: handleCompareFetch }}
    >
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
        current="plan"
        mapQuery={mapViewQuery(mapView)}
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
            onWptMove={actions.moveWaypoint}
            onWptAdd={waypoints.length >= 2 ? actions.insertWaypoint : undefined}
            onWptDelete={actions.deleteWaypoint}
            onMapClick={actions.appendWaypoint}
            initialCenter={initial.center}
            userPosition={userPosition}
            onViewChange={onViewChange}
            initialZoom={handedView?.zoom ?? null}
            showSeamarks={seamarks}
            depths={waypointDepths}
            highlightedSegmentRange={highlightedSegmentRange}
            focusedSegmentIdx={focusedSegmentIdx}
          />
          {/* Navigation menu — same control, same corner as on the home
              map; the camera travels with its links so going back to the
              forecast leaves the map where it is. */}
          {isDesktop && (
            <NavMenu
              variant="map"
              current="plan"
              mapQuery={mapViewQuery(mapView)}
              className="top-3 left-3"
            />
          )}
          {/* Marine-chart toggle — top right, the corner a layer control
              conventionally lives in, and the only one free on this page:
              the menu owns the top left and the locate button plus its
              error bubble own the bottom right. */}
          <SeamarkButton enabled={seamarks} onToggle={toggleSeamarks} className="top-3 right-3" />
          {/* Locate FAB — bottom right of the map container, which shrinks as
              the mobile drawer is dragged up, so the button follows it.
              16 px above the drawer edge, the reference gap reused on the
              home overlay. */}
          <LocateButton
            status={geolocStatus}
            attempt={geolocAttempt}
            onClick={handleLocate}
            className="bottom-4 right-3"
          />
          {/* Hint overlay while building the route */}
          {waypoints.length < 2 && (
            <div className="absolute inset-x-4 bottom-4 z-[400] flex justify-center pointer-events-none">
              <div
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--ow-surface-glass)", backdropFilter: "blur(8px)", border: "1px solid var(--ow-line-2)", color: "var(--ow-fg-1)" }}
              >
                {waypoints.length === 0
                  ? t("plan.page.hint.placeStart")
                  : t("plan.page.hint.drawRoute")}
              </div>
            </div>
          )}
        </div>

        {/* Desktop sidebar — user-resizable via the handle on the left edge.
            Mounted only above `lg`: both layouts used to be in the DOM at all
            times with one hidden by CSS, so every state tick rendered the
            panel twice, re-read ow_polar_config_v1 twice, and every button of
            the planner existed twice for assistive technology. */}
        {isDesktop && (
          <ResizableDesktopSidebar defaultPx={384}>
            <PlanSidebar />
          </ResizableDesktopSidebar>
        )}
      </div>

      {/* Mobile drawer — below map. Auto-slides to a target height based on
          where the user is in the flow (no waypoints → minimal so the map
          stays the focus; 2 waypoints → tall enough to surface just the
          mode pills; mode confirmed → full content height). The drag handle
          still lets the user override at any time.
          Its head carries the totals of a computed passage, single mode
          only. Hidden as soon as the route was edited without recalculating:
          stale totals would contradict the "Recalculer" hint in the drawer.
          Complexity is read from the colored route itself. */}
      {!isDesktop && (
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
          head={passage && planMode === "single" && !isStale ? <StatBand passage={passage} /> : null}
        >
          <PlanSidebar />
        </ResizableMobileDrawer>
      )}
    </div>
    </PlanProvider>
  );
}
