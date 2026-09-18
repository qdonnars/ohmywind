// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CompareHint } from "./CompareHint";
import { CompareDoor } from "./CompareDoor";
import { SPOTLIGHT_MS } from "./doorsSpotlight";
import { PlanProvider } from "./session/PlanProvider";
import type { PlanContextValue } from "./session/planContext";
import { createInitialState, type PlanState } from "./session/reducer";
import type { InitialSession } from "./session/initial";
import type { PlanActions } from "./session/usePlanSession";
import type { PassageReport, ComplexityScore } from "./types";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";

const MARSEILLE: [number, number] = [43.29, 5.37];
const PORQUEROLLES: [number, number] = [43.0, 6.2];

const passage = (): PassageReport => ({
  archetype: "cruiser_30ft",
  departure_time: "2026-09-10T08:00:00+02:00",
  arrival_time: "2026-09-10T18:00:00+02:00",
  duration_h: 10,
  distance_nm: 55,
  efficiency: 0.75,
  model: "arome",
  segments: [],
  warnings: [],
});
const complexity = (): ComplexityScore => ({
  level: 2, label: "Modéré", wind_level: 2, wind_label: "Modéré", sea_level: 1, sea_label: "Calme",
  tws_max_kn: 14, hs_max_m: 0.8, rationale: "",
});

const session: InitialSession = {
  waypoints: [MARSEILLE, PORQUEROLLES],
  originWaypoints: [MARSEILLE, PORQUEROLLES],
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
};

function mount(state: Partial<PlanState> = {}) {
  const value: PlanContextValue = {
    state: { ...createInitialState(session), ...state },
    actions: {} as PlanActions,
    archetypes: [],
    isLoading: false,
    compute: vi.fn(),
    computeWindows: vi.fn(),
  };
  // The doors too: « Y aller » scrolls to them and lights them up, and the
  // card sits next to them when they are already on screen.
  return render(
    <PlanProvider value={value}>
      <CompareHint />
      <CompareDoor />
    </PlanProvider>,
  );
}

const fresh = () => ({ passage: passage(), complexity: complexity() });

/** The row of the two doors as laid out on screen: jsdom measures every box as empty. */
function layDoorsOut(rect: Pick<DOMRect, "top" | "bottom" | "left" | "right">) {
  const row = document.querySelector<HTMLElement>("[data-compare-doors-row]");
  if (!row) throw new Error("no doors in the DOM");
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // Inside the card's shelf life, whenever the suite runs.
  vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // jsdom has no matchMedia; the desktop test lends one.
  Reflect.deleteProperty(window, "matchMedia");
});

describe("CompareHint", () => {
  it("shows once, a moment after the first plan, and stays gone once dismissed", () => {
    mount(fresh());
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    // fireEvent rather than userEvent: the latter waits on timers this test
    // has faked.
    fireEvent.click(screen.getByRole("button", { name: "Compris" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBe("done");
  });

  it("does not show without a fresh plan, nor once the comparison was opened", () => {
    mount({ ...fresh(), isStale: true });
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    // The comparison open is the lesson learnt: the flag is set for good.
    mount({ mode: "compare", ...fresh() });
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBe("done");
  });

  it("is an announcement with a shelf life: nothing past SHOWN_UNTIL", () => {
    // Well past the month the card is meant for (2026-10-19).
    vi.setSystemTime(new Date("2027-01-01T10:00:00Z"));
    mount(fresh());
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    // And nothing was written: a reader who never saw it has nothing to forget.
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBeNull();
  });

  it("« Y aller » closes the card, scrolls to the doors and lights them up for a moment", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mount(fresh());
    act(() => { vi.advanceTimersByTime(3_000); });
    const doors = () => [
      screen.getByRole("button", { name: "D'autres départs" }),
      screen.getByRole("button", { name: "Un autre itinéraire" }),
    ];
    for (const door of doors()) expect(door.classList.contains("door-spotlight")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Y aller" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.compareHint)).toBe("done");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
    for (const door of doors()) expect(door.classList.contains("door-spotlight")).toBe(true);

    act(() => { vi.advanceTimersByTime(SPOTLIGHT_MS); });
    for (const door of doors()) expect(door.classList.contains("door-spotlight")).toBe(false);
  });

  it("sits over the map when the doors are off screen", () => {
    mount(fresh());
    act(() => { vi.advanceTimersByTime(3_000); });
    const card = screen.getByRole("dialog");
    expect(card.className).toContain("absolute");
    expect(card.style.bottom).toBe("");
    expect(document.querySelector(".onboard-caret-down, .onboard-caret-right")).toBeNull();
  });

  it("under lg, sits just above the doors when they are already on screen", () => {
    mount(fresh());
    // jsdom's window is 1024 × 768; the drawer's doors at 500 to 580.
    layDoorsOut({ top: 500, bottom: 580, left: 0, right: 1024 });
    act(() => { vi.advanceTimersByTime(3_000); });
    const card = screen.getByRole("dialog");
    expect(card.className).toContain("fixed");
    expect(card.style.bottom).toBe(`${768 - 500 + 14}px`);
    expect(card.querySelector(".onboard-caret-down")).toBeTruthy();
  });

  it("on desktop, sits on the map to the left of the doors, bottom edges aligned, caret at their middle", () => {
    window.matchMedia = () =>
      ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    mount(fresh());
    // The sidebar's doors, 700 to 1024 wide, 600 to 680 high.
    layDoorsOut({ top: 600, bottom: 680, left: 700, right: 1024 });
    act(() => { vi.advanceTimersByTime(3_000); });
    const card = screen.getByRole("dialog");
    expect(card.className).toContain("fixed");
    expect(card.style.right).toBe(`${1024 - 700 + 14}px`);
    expect(card.style.bottom).toBe(`${768 - 680}px`);
    const caret = card.querySelector<HTMLElement>(".onboard-caret-right");
    // The doors' middle is 640; the card's bottom edge is at 680: 40 up, less
    // half the caret.
    expect(caret?.style.bottom).toBe("32px");
  });

  it("goes back over the map once the doors scroll out of view", () => {
    mount(fresh());
    layDoorsOut({ top: 500, bottom: 580, left: 0, right: 1024 });
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole("dialog").className).toContain("fixed");
    // Scrolled below the window's bottom edge.
    layDoorsOut({ top: 740, bottom: 820, left: 0, right: 1024 });
    fireEvent.scroll(document);
    expect(screen.getByRole("dialog").className).toContain("absolute");
  });
});
