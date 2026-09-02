// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Integration: the hook wired to a fake backend, in jsdom.
 *
 * The reducer is covered on its own in `reducer.test.ts`. What this file
 * exercises is the seam between the two: that a computation really is minted
 * with an id, that its reply reaches the reducer, that persistence actually
 * lands in `localStorage` and in the address bar, and that a superseded reply
 * is dropped by the machinery, not just by the reducer in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBackDismiss } from "../../hooks/useBackDismiss";
import type { PassageReport, ComplexityScore, PassageWindow } from "../types";
import type { InitialSession } from "./initial";
import { toTzAware } from "../departureTz";
import { usePlanSession } from "./usePlanSession";

const fetchPassage = vi.fn();
const fetchPassageWindows = vi.fn();
const fetchPassageByEta = vi.fn();

vi.mock("../../api/passage", () => ({
  fetchPassage: (...args: unknown[]) => fetchPassage(...args),
  fetchPassageWindows: (...args: unknown[]) => fetchPassageWindows(...args),
  fetchPassageByEta: (...args: unknown[]) => fetchPassageByEta(...args),
  friendlyError: (raw: string) => `traduit: ${raw}`,
}));

// The corridor sampler talks to Open-Meteo; the plan under test does not care
// what it returns, only that it resolves.
vi.mock("../../api/forecastCache", () => ({
  buildForecastCacheSafe: () => Promise.resolve(undefined),
  singleWindowMs: () => ({ start: 0, end: 0 }),
  sweepWindowMs: () => ({ start: 0, end: 0 }),
  etaWindowMs: () => ({ start: 0, end: 0 }),
}));

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

/**
 * Naive local times, turned into wire values by `toTzAware`, so the assertions
 * on what lands in the URL hold whatever timezone the runner uses. Hard-coding
 * a Paris offset here read two hours off on a UTC runner.
 */
const RESOLVED_DEPARTURE = "2026-09-10T08:00";
const WINDOW_DEPARTURE = "2026-09-11T06:00";

const passage = (over: Partial<PassageReport> = {}): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: toTzAware(RESOLVED_DEPARTURE),
  arrival_time: toTzAware("2026-09-10T18:00"),
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "meteofrance_arome_france_hd",
  segments: [],
  warnings: [],
  ...over,
});

const complexity = (): ComplexityScore => ({
  level: 2,
  label: "Modéré",
  wind_level: 2,
  wind_label: "Modéré",
  sea_level: 1,
  sea_label: "Calme",
  tws_max_kn: 14,
  hs_max_m: 0.8,
  rationale: "",
});

const aWindow = (over: Partial<PassageWindow> = {}): PassageWindow => ({
  departure: toTzAware(WINDOW_DEPARTURE),
  arrival: toTzAware("2026-09-11T16:00"),
  duration_h: 10,
  distance_nm: 55,
  complexity: { level: 2, label: "Modéré", tws_max_kn: 14, rationale: "" },
  conditions_summary: {
    tws_min_kn: 8,
    tws_max_kn: 14,
    predominant_sail_angle: "largue",
    hs_min_m: 0.3,
    hs_max_m: 0.8,
  },
  warnings: [],
  ...over,
});

const session = (over: Partial<InitialSession> = {}): InitialSession => ({
  waypoints: [MARSEILLE, PORQUEROLLES],
  archetype: "cruiser_30ft",
  departure: "2026-09-10T08:00",
  timeAnchor: "departure",
  mode: "single",
  sweepEarliest: "2026-09-10T08:00",
  sweepLatest: "2026-09-12T08:00",
  sweepIntervalHours: 3,
  passage: null,
  complexity: null,
  windows: null,
  metaWarnings: [],
  forecastUpdatedAt: null,
  isStale: false,
  actionTaken: true,
  center: null,
  urlError: null,
  mount: { rewriteUrl: false, fetch: false },
  sources: { route: "url", boat: "url", departure: "url" },
  ...over,
});

/** A promise plus the handles to settle it from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Stable across the re-renders of the composed hook above. */
const sessionWithRoute = { current: session() };

beforeEach(() => {
  sessionWithRoute.current = session();
  fetchPassage.mockReset();
  fetchPassageWindows.mockReset();
  fetchPassageByEta.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/plan");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePlanSession", () => {
  it("computes, shows the result and persists it", async () => {
    fetchPassage.mockResolvedValue({
      passage: passage(),
      complexity: complexity(),
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.state.passage).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.state.passage?.distance_nm).toBe(55);

    // The address bar and the simulation cache both carry the committed plan.
    expect(window.location.search).toContain("wpts=43.29000,5.37000;43.00000,6.20000");
    const cached = JSON.parse(localStorage.getItem("ow_last_simulation_v1")!);
    expect(cached.single.passage.distance_nm).toBe(55);
    expect(cached.mode).toBe("single");
  });

  it("hands the request an abort signal and aborts it when a newer one starts", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    fetchPassage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(fetchPassage).toHaveBeenCalledTimes(1));
    const firstSignal = fetchPassage.mock.calls[0][0].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    act(() => result.current.actions.compute());
    await waitFor(() => expect(fetchPassage).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    // The stale reply lands anyway (a request already sent can still answer).
    await act(async () => {
      first.resolve({
        passage: passage({ distance_nm: 999 }),
        complexity: complexity(),
        forecast_updated_at: "2026-09-09T06:00:00Z",
      });
      await first.promise;
    });
    expect(result.current.state.passage).toBeNull();
    expect(localStorage.getItem("ow_last_simulation_v1")).toBeNull();

    await act(async () => {
      second.resolve({
        passage: passage({ distance_nm: 55 }),
        complexity: complexity(),
        forecast_updated_at: "2026-09-09T06:00:00Z",
      });
      await second.promise;
    });
    await waitFor(() => expect(result.current.state.passage?.distance_nm).toBe(55));
  });

  it("throws away a result whose route the user edited while it flew", async () => {
    const inFlight = deferred<unknown>();
    fetchPassage.mockReturnValue(inFlight.promise);
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(fetchPassage).toHaveBeenCalledTimes(1));
    act(() => result.current.actions.moveWaypoint(1, 42.9, 6.4));

    await act(async () => {
      inFlight.resolve({
        passage: passage({ distance_nm: 999 }),
        complexity: complexity(),
        forecast_updated_at: "2026-09-09T06:00:00Z",
      });
      await inFlight.promise;
    });

    expect(result.current.state.passage).toBeNull();
    expect(result.current.state.isStale).toBe(true);
    // The bug this fixes: the old passage used to be written next to the new
    // waypoints and shown as fresh.
    expect(localStorage.getItem("ow_last_simulation_v1")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("translates a failure into the user-facing sentence", async () => {
    fetchPassage.mockRejectedValue(new Error("rate limit exceeded"));
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(result.current.state.apiError).toBe("traduit: rate limit exceeded"));
    expect(result.current.isLoading).toBe(false);
  });

  it("says nothing when the request was aborted", async () => {
    fetchPassage.mockRejectedValue(
      new DOMException("The user aborted a request.", "AbortError"),
    );
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(fetchPassage).toHaveBeenCalled());
    // Give the rejection a turn to land.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.apiError).toBeNull();
  });

  it("keeps the two spinners apart", async () => {
    const sweep = deferred<unknown>();
    fetchPassageWindows.mockReturnValue(sweep.promise);
    const { result } = renderHook(() => usePlanSession(session({ mode: "compare" })));

    act(() => result.current.actions.computeWindows());
    expect(result.current.isLoadingSweep).toBe(true);
    expect(result.current.isLoadingSingle).toBe(false);
    // The panel is on the compare view, so it does blank for this one.
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      sweep.resolve({
        windows: [aWindow()],
        meta_warnings: [],
        forecast_updated_at: "2026-09-09T06:00:00Z",
      });
      await sweep.promise;
    });
    await waitFor(() => expect(result.current.state.windows).toHaveLength(1));
  });

  it("walks the URL to compute to a picked window", async () => {
    fetchPassageWindows.mockResolvedValue({
      windows: [aWindow({ passage: passage(), complexity_full: complexity() })],
      meta_warnings: [],
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    const { result } = renderHook(() => usePlanSession(session({ mode: "compare" })));

    act(() => result.current.actions.computeWindows());
    await waitFor(() => expect(result.current.state.windows).toHaveLength(1));
    // A sweep leaves the address bar alone: its range is not in the URL.
    expect(window.location.search).toBe("");

    act(() => result.current.actions.selectWindow(result.current.state.windows![0]));
    expect(result.current.state.mode).toBe("single");
    expect(result.current.state.passage).not.toBeNull();
    // Zero refetch: the window carried its own detail.
    expect(fetchPassage).not.toHaveBeenCalled();
    expect(window.location.search).toContain(
      `departure=${encodeURIComponent(WINDOW_DEPARTURE)}`,
    );
    // The compare payload survives next to the freshly picked single result.
    const cached = JSON.parse(localStorage.getItem("ow_last_simulation_v1")!);
    expect(cached.compare.windows).toHaveLength(1);
    expect(cached.mode).toBe("single");
  });

  it("falls back to computing when the picked window carries no detail", async () => {
    fetchPassageWindows.mockResolvedValue({
      windows: [aWindow()],
      meta_warnings: [],
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    fetchPassage.mockResolvedValue({
      passage: passage(),
      complexity: complexity(),
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    const { result } = renderHook(() => usePlanSession(session({ mode: "compare" })));

    act(() => result.current.actions.computeWindows());
    await waitFor(() => expect(result.current.state.windows).toHaveLength(1));
    act(() => result.current.actions.selectWindow(result.current.state.windows![0]));
    await waitFor(() => expect(fetchPassage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state.passage).not.toBeNull());
  });

  it("mirrors the uncommitted plan in the tab's draft, and clears it once computed", async () => {
    fetchPassage.mockResolvedValue({
      passage: passage(),
      complexity: complexity(),
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.appendWaypoint(42.9, 6.4));
    await waitFor(() => expect(sessionStorage.getItem("ow_plan_draft_v1")).not.toBeNull());
    expect(JSON.parse(sessionStorage.getItem("ow_plan_draft_v1")!).waypoints).toHaveLength(3);

    act(() => result.current.actions.compute());
    await waitFor(() => expect(sessionStorage.getItem("ow_plan_draft_v1")).toBeNull());
  });

  it("empties everything on reset", async () => {
    fetchPassage.mockResolvedValue({
      passage: passage(),
      complexity: complexity(),
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    const { result } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(localStorage.getItem("ow_last_simulation_v1")).not.toBeNull());

    act(() => result.current.actions.reset());
    await waitFor(() => expect(localStorage.getItem("ow_last_simulation_v1")).toBeNull());
    expect(result.current.state.waypoints).toEqual([]);
    expect(window.location.pathname + window.location.search).toBe("/plan");
  });

  it("still rewinds the address bar when a leg was expanded (back-dismiss layer)", async () => {
    fetchPassage.mockResolvedValue({
      passage: passage(),
      complexity: complexity(),
      forecast_updated_at: "2026-09-09T06:00:00Z",
    });
    // Mirrors how PlanPage wires the two: an expanded leg opens a history
    // entry of its own, and closing it pops that entry back off. The address
    // bar has to be rewritten before that pop, or the pop restores the URL
    // the reset just replaced.
    const { result } = renderHook(() => {
      const session = usePlanSession(sessionWithRoute.current);
      useBackDismiss(session.state.selectedLegIdx !== null, () =>
        session.actions.selectLeg(null),
      );
      return session;
    });

    act(() => result.current.actions.compute());
    await waitFor(() => expect(result.current.state.passage).not.toBeNull());
    act(() => result.current.actions.selectLeg(0));
    await waitFor(() => expect(result.current.state.selectedLegIdx).toBe(0));

    act(() => result.current.actions.reset());
    // Let the pop the closing layer asks for actually run: it is queued, so a
    // naive assertion would pass before it lands.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(window.location.pathname + window.location.search).toBe("/plan");
  });

  it("aborts what is in flight when the page goes away", async () => {
    const inFlight = deferred<unknown>();
    fetchPassage.mockReturnValue(inFlight.promise);
    const { result, unmount } = renderHook(() => usePlanSession(session()));

    act(() => result.current.actions.compute());
    await waitFor(() => expect(fetchPassage).toHaveBeenCalledTimes(1));
    const signal = fetchPassage.mock.calls[0][0].signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
  });
});
