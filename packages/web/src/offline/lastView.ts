// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { getLocation, navigate, subscribe, type AppLocation } from "../navigation";
import { isNativeShell } from "../native";

/**
 * Reopen the app on the view it was closed on (issue #537).
 *
 * The app starts at `/` (the manifest's `start_url`, the shells' server URL),
 * which is the explorer. The explorer already comes back on its last spot
 * (`config/lastSpot.ts`); someone who closed the app on a plan landed on the
 * map instead and had to find the planner again. So the last of the two main
 * views is remembered, with the plan's full URL (route, boat, departure), and
 * a launch on bare `/` goes back to it.
 *
 * What never resumes, so that an explicit destination always wins:
 *
 * - any other address: a deep link, a shared plan, the launcher shortcuts
 *   (`/plan`, `/config`), `/` with a camera handed over (`?center=`);
 * - a reload or a back/forward into the document: the reader is already
 *   where they want to be;
 * - a plain browser tab. Typing ohmywind.fr is asking for the home page;
 *   reopening an *app* is asking for where one was. Only an installed PWA, the
 *   TWA and the native shells count as an app launch.
 *
 * The shells' own shortcuts reach the page after it has loaded (see
 * `native/appLinks.ts`) and navigate on top of whatever the resume did.
 *
 * The plan is pushed over the explorer rather than put in its place, so that
 * the back button from a resumed plan goes to the explorer, as it would have
 * when the plan was first opened, instead of leaving the app.
 */

export type LastView = { view: "explore" } | { view: "plan"; url: string };

const STORAGE_KEY = LOCAL_STORAGE_KEYS.lastView;

function isPlanUrl(url: string): boolean {
  return url === "/plan" || url.startsWith("/plan?");
}

/** The view a location counts as, or null for the other pages. */
export function lastViewOf(location: AppLocation): LastView | null {
  if (location.path === "/") return { view: "explore" };
  if (location.path === "/plan") return { view: "plan", url: `/plan${location.search}` };
  return null;
}

export function parseLastView(raw: string | null): LastView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { view?: unknown; url?: unknown };
    if (v.view === "explore") return { view: "explore" };
    if (v.view === "plan" && typeof v.url === "string" && isPlanUrl(v.url)) {
      return { view: "plan", url: v.url };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadLastView(): LastView | null {
  try {
    return parseLastView(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveLastView(view: LastView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    /* no storage: no resume, nothing else lost */
  }
}

export interface ResumeInput {
  path: string;
  search: string;
  hash: string;
  /** `PerformanceNavigationTiming.type` of the document, when known. */
  navigationType: string | undefined;
  /** Installed PWA, TWA or native shell. */
  appLaunch: boolean;
  lastView: LastView | null;
}

/** Where to take a fresh launch, or null to stay. Pure. */
export function resumeTarget(input: ResumeInput): string | null {
  if (!input.appLaunch) return null;
  if (input.path !== "/" || input.search !== "" || input.hash !== "") return null;
  if (input.navigationType !== undefined && input.navigationType !== "navigate") return null;
  if (input.lastView?.view !== "plan") return null;
  return input.lastView.url;
}

/** Whether this document was opened as an app rather than in a browser tab. */
function isAppLaunch(): boolean {
  try {
    if (isNativeShell()) return true;
    if ((navigator as { standalone?: boolean }).standalone === true) return true;
    return ["standalone", "fullscreen", "minimal-ui"].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
  } catch {
    return false;
  }
}

function navigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type;
  } catch {
    return undefined;
  }
}

/**
 * Whether the plan this launch resumed is still the page on screen.
 *
 * The plan is pushed without a tap, and Chromium then marks the entry under
 * it as one the system back skips: in the Android shell, back from the
 * resumed plan found no history and left the app (QA of 2026-11-24). The
 * shell's back handler asks this to go to the explorer instead. Cleared as
 * soon as the reader leaves the plan, or when the system opens a page
 * (`forgetResume`): a shortcut or a link opened cold still leaves the app
 * on back.
 */
let resumedPlan = false;

export function isOnResumedPlan(): boolean {
  return resumedPlan && getLocation().path === "/plan";
}

export function forgetResume(): void {
  resumedPlan = false;
}

/**
 * At boot, before the first render: go back to the last view if this is a
 * fresh app launch on `/`, then keep the last view up to date for the next.
 */
export function startLastViewTracking(): void {
  const target = resumeTarget({
    path: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    navigationType: navigationType(),
    appLaunch: isAppLaunch(),
    lastView: loadLastView(),
  });
  if (target) {
    navigate(target);
    resumedPlan = true;
  }

  const record = () => {
    const location = getLocation();
    if (location.path !== "/plan") resumedPlan = false;
    const view = lastViewOf(location);
    if (view) saveLastView(view);
  };
  record();
  subscribe(record);
}
