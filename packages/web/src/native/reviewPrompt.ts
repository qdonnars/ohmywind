// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { isNativeShell, loadPlugins } from "./index";

/**
 * When the app asks the store for its native rating sheet (StoreKit on iOS,
 * Play In-App Review on Android). Inside the app only: a website has no
 * store to ask.
 *
 * The rule, all of it here:
 *
 * - after a plan computed successfully, the `plansBeforeAsking`-th one or
 *   any later one;
 * - at least `minDaysSinceFirstLaunch` days after the first launch of the
 *   app (the native shell, not the site, not the former Android app). The
 *   date is written by the shell itself and never comes from elsewhere: the
 *   key is neither carried over from the former app (`storage/transfer.ts`)
 *   nor restored from the native backup (`native/nativeBackup.ts`), so a
 *   reader who brings years of data across still waits the full delay;
 * - at most once per version of the app, and the plan count starts again
 *   after each request;
 * - never while the reader is typing: the request then waits for the next
 *   plan.
 *
 * The store has the last word (Apple shows the sheet at most three times a
 * year, Google has its own quota) and says nothing about what it did.
 */
export const REVIEW_RULES = {
  plansBeforeAsking: 3,
  minDaysSinceFirstLaunch: 14,
  /** Lets the result land on screen before a sheet covers it. */
  delayAfterPlanMs: 2000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = LOCAL_STORAGE_KEYS.reviewPrompt;

export interface ReviewState {
  /** ms since epoch, first launch of the shell as this storage knows it. */
  firstLaunchAt: number;
  /** Plans computed since the first launch or the last request. */
  plans: number;
  /** App version the sheet was last requested for. */
  askedVersion?: string;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function readReviewState(storage: Pick<Storage, "getItem">): ReviewState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v !== "object" || v === null) return null;
    const { firstLaunchAt, plans, askedVersion } = v;
    if (typeof firstLaunchAt !== "number" || !Number.isFinite(firstLaunchAt)) return null;
    return {
      firstLaunchAt,
      plans: typeof plans === "number" && Number.isFinite(plans) && plans > 0 ? Math.floor(plans) : 0,
      ...(typeof askedVersion === "string" ? { askedVersion } : {}),
    };
  } catch {
    return null;
  }
}

function write(storage: Store, state: ReviewState): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage refused: no request this time, which is the safe side */
  }
}

/**
 * Called at every start of the shell. Writes the first launch once; a date
 * in the future (a clock set back since) starts the wait again rather than
 * shortening it.
 */
export function recordShellLaunch(storage: Store, now: number): ReviewState {
  const current = readReviewState(storage);
  if (current && current.firstLaunchAt <= now) return current;
  const fresh: ReviewState = { ...(current ?? { plans: 0 }), firstLaunchAt: now };
  write(storage, fresh);
  return fresh;
}

/** Whether the sheet may be requested now, for `version`. Pure. */
export function isDue(state: ReviewState, now: number, version: string): boolean {
  return (
    state.plans >= REVIEW_RULES.plansBeforeAsking &&
    now - state.firstLaunchAt >= REVIEW_RULES.minDaysSinceFirstLaunch * DAY_MS &&
    state.askedVersion !== version
  );
}

export interface ReviewDeps {
  storage: Store;
  now(): number;
  appVersion(): Promise<string>;
  /** True while a text field has the focus. */
  isTyping(): boolean;
  wait(ms: number): Promise<void>;
  requestReview(): Promise<void>;
}

export type ReviewOutcome = "counted" | "requested" | "deferred";

/** One plan computed successfully, inside the shell. */
export async function onPlanComputed(deps: ReviewDeps): Promise<ReviewOutcome> {
  const state = readReviewState(deps.storage) ?? recordShellLaunch(deps.storage, deps.now());
  const counted: ReviewState = { ...state, plans: state.plans + 1 };
  write(deps.storage, counted);

  const version = await deps.appVersion();
  if (!isDue(counted, deps.now(), version)) return "counted";
  await deps.wait(REVIEW_RULES.delayAfterPlanMs);
  if (deps.isTyping()) return "deferred";
  // Re-read: another plan (or another tab) may have asked meanwhile.
  const latest = readReviewState(deps.storage);
  if (!latest || !isDue(latest, deps.now(), version)) return "counted";
  write(deps.storage, { ...latest, plans: 0, askedVersion: version });
  await deps.requestReview().catch(() => undefined);
  return "requested";
}

/** A text field has the focus: the reader is typing, or about to. */
export function isTypingIn(doc: Pick<Document, "activeElement">): boolean {
  const el = doc.activeElement as (Element & { isContentEditable?: boolean }) | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(type);
}

/**
 * For the planner: a plan was computed successfully. A no-op outside the
 * app, and never an error in the planner's way.
 */
export function notePlanComputed(): void {
  if (!isNativeShell()) return;
  loadPlugins()
    .then((plugins) => {
      if (!plugins) return;
      return onPlanComputed({
        storage: window.localStorage,
        now: () => Date.now(),
        appVersion: plugins.shellVersion,
        isTyping: () => isTypingIn(document),
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        requestReview: plugins.requestStoreReview,
      });
    })
    .catch(() => undefined);
}
