// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { getLocation, navigate } from "../navigation";
import {
  lastViewOf,
  loadLastView,
  parseLastView,
  resumeTarget,
  startLastViewTracking,
  type ResumeInput,
} from "./lastView";

const KEY = LOCAL_STORAGE_KEYS.lastView;
const PLAN = "/plan?wpts=43.1,5.9;43.0,6.2&boat=cruiser_30ft&dep=2026-11-18T08:00";

const launch: ResumeInput = {
  path: "/",
  search: "",
  hash: "",
  navigationType: "navigate",
  appLaunch: true,
  lastView: { view: "plan", url: PLAN },
};

function standalone(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: matches && query.includes("standalone"), media: query }) as MediaQueryList,
  );
}

function nextPopState(): Promise<void> {
  return new Promise((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
}

describe("resumeTarget", () => {
  it("takes an app launch on bare / back to the last plan", () => {
    expect(resumeTarget(launch)).toBe(PLAN);
  });

  it("stays on the explorer when it was the last view", () => {
    expect(resumeTarget({ ...launch, lastView: { view: "explore" } })).toBeNull();
    expect(resumeTarget({ ...launch, lastView: null })).toBeNull();
  });

  it("never overrides an explicit destination", () => {
    // A shortcut, a deep link, a shared plan, a camera handed over.
    expect(resumeTarget({ ...launch, path: "/plan" })).toBeNull();
    expect(resumeTarget({ ...launch, path: "/config" })).toBeNull();
    expect(resumeTarget({ ...launch, search: "?center=43.2,5.3&zoom=9" })).toBeNull();
    expect(resumeTarget({ ...launch, hash: "#x" })).toBeNull();
  });

  it("leaves reloads, history moves and plain browser tabs alone", () => {
    expect(resumeTarget({ ...launch, navigationType: "reload" })).toBeNull();
    expect(resumeTarget({ ...launch, navigationType: "back_forward" })).toBeNull();
    expect(resumeTarget({ ...launch, appLaunch: false })).toBeNull();
    expect(resumeTarget({ ...launch, navigationType: undefined })).toBe(PLAN);
  });
});

describe("the remembered view", () => {
  it("is the explorer or the plan with its URL, nothing else", () => {
    expect(lastViewOf({ path: "/", search: "?center=1,2" })).toEqual({ view: "explore" });
    expect(lastViewOf({ path: "/plan", search: "?wpts=1,2;3,4" })).toEqual({ view: "plan", url: "/plan?wpts=1,2;3,4" });
    expect(lastViewOf({ path: "/config", search: "" })).toBeNull();
  });

  it("refuses a stored URL that is not a plan", () => {
    expect(parseLastView('{"view":"plan","url":"https://evil.example/plan"}')).toBeNull();
    expect(parseLastView('{"view":"plan","url":"/planx"}')).toBeNull();
    expect(parseLastView("not json")).toBeNull();
    expect(parseLastView('{"view":"explore"}')).toEqual({ view: "explore" });
  });
});

describe("startLastViewTracking", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reopens the installed app on its plan, with the explorer under it for the back button", async () => {
    localStorage.setItem(KEY, JSON.stringify({ view: "plan", url: PLAN }));
    standalone(true);
    const before = window.history.length;

    startLastViewTracking();

    expect(window.location.pathname + window.location.search).toBe(encodeURI(PLAN).replace(/%3B/g, ";"));
    expect(getLocation().path).toBe("/plan");
    expect(window.history.length).toBe(before + 1);

    // Back from the resumed plan lands on the explorer, inside the app.
    const popped = nextPopState();
    window.history.back();
    await popped;
    expect(getLocation()).toEqual({ path: "/", search: "" });
  });

  it("stays on / in a browser tab", () => {
    localStorage.setItem(KEY, JSON.stringify({ view: "plan", url: PLAN }));
    standalone(false);
    startLastViewTracking();
    expect(window.location.pathname).toBe("/");
    // And that visit counts as the explorer for the next launch.
    expect(loadLastView()).toEqual({ view: "explore" });
  });

  it("follows the plan URL as the page rewrites it", () => {
    standalone(false);
    startLastViewTracking();
    navigate("/plan?wpts=1,2;3,4", { replace: true });
    expect(loadLastView()).toEqual({ view: "plan", url: "/plan?wpts=1,2;3,4" });
    navigate("/config");
    expect(loadLastView()).toEqual({ view: "plan", url: "/plan?wpts=1,2;3,4" });
  });
});
