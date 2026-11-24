// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { encodePayload } from "../storage/transfer";
import {
  REVIEW_RULES,
  isDue,
  isTypingIn,
  onPlanComputed,
  readReviewState,
  recordShellLaunch,
  type ReviewDeps,
} from "./reviewPrompt";
import { handleReturnUrl, type ShellDeps } from "./shellImport";

const DAY = 24 * 60 * 60 * 1000;
const KEY = LOCAL_STORAGE_KEYS.reviewPrompt;
const T0 = Date.UTC(2026, 10, 1);

function memory(entries: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(entries));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function deps(storage: Storage, now: number, over: Partial<ReviewDeps> = {}): ReviewDeps & { requestReview: ReturnType<typeof vi.fn> } {
  return {
    storage,
    now: () => now,
    appVersion: async () => "2.0.0",
    isTyping: () => false,
    wait: async () => undefined,
    requestReview: vi.fn(async () => undefined),
    ...over,
  } as ReviewDeps & { requestReview: ReturnType<typeof vi.fn> };
}

async function plans(storage: Storage, now: number, count: number, over: Partial<ReviewDeps> = {}) {
  const d = deps(storage, now, over);
  const outcomes = [];
  for (let i = 0; i < count; i++) outcomes.push(await onPlanComputed(d));
  return { d, outcomes };
}

describe("review rules", () => {
  it("are the owner's: third plan, two weeks after the first launch", () => {
    expect(REVIEW_RULES.plansBeforeAsking).toBe(3);
    expect(REVIEW_RULES.minDaysSinceFirstLaunch).toBe(14);
  });
});

describe("recordShellLaunch", () => {
  it("writes the first launch once", () => {
    const s = memory();
    recordShellLaunch(s, T0);
    recordShellLaunch(s, T0 + 30 * DAY);
    expect(readReviewState(s)?.firstLaunchAt).toBe(T0);
  });

  it("starts the wait again when the date is in the future", () => {
    const s = memory({ [KEY]: JSON.stringify({ firstLaunchAt: T0 + 100 * DAY, plans: 5 }) });
    expect(recordShellLaunch(s, T0).firstLaunchAt).toBe(T0);
  });
});

describe("onPlanComputed", () => {
  it("asks at the third plan once the delay has passed", async () => {
    const s = memory();
    recordShellLaunch(s, T0);
    const { d, outcomes } = await plans(s, T0 + 14 * DAY, 3);
    expect(outcomes).toEqual(["counted", "counted", "requested"]);
    expect(d.requestReview).toHaveBeenCalledTimes(1);
    expect(readReviewState(s)).toMatchObject({ plans: 0, askedVersion: "2.0.0" });
  });

  it("never asks before the delay, however many plans", async () => {
    const s = memory();
    recordShellLaunch(s, T0);
    const { d } = await plans(s, T0 + 14 * DAY - 1, 20);
    expect(d.requestReview).not.toHaveBeenCalled();
    // The plans counted meanwhile make the next one after the delay ask.
    const later = await plans(s, T0 + 14 * DAY, 1);
    expect(later.outcomes).toEqual(["requested"]);
  });

  it("asks once per version of the app", async () => {
    const s = memory();
    recordShellLaunch(s, T0);
    const first = await plans(s, T0 + 20 * DAY, 10);
    expect(first.d.requestReview).toHaveBeenCalledTimes(1);
    const next = await plans(s, T0 + 40 * DAY, 3, { appVersion: async () => "2.1.0" });
    expect(next.d.requestReview).toHaveBeenCalledTimes(1);
  });

  it("waits for the next plan while the reader is typing", async () => {
    const s = memory();
    recordShellLaunch(s, T0);
    const typing = await plans(s, T0 + 15 * DAY, 3, { isTyping: () => true });
    expect(typing.outcomes.at(-1)).toBe("deferred");
    expect(typing.d.requestReview).not.toHaveBeenCalled();
    const after = await plans(s, T0 + 15 * DAY, 1);
    expect(after.outcomes).toEqual(["requested"]);
  });

  it("counts from now when the shell never recorded a launch", async () => {
    const s = memory();
    const { d } = await plans(s, T0, 5);
    expect(readReviewState(s)?.firstLaunchAt).toBe(T0);
    expect(d.requestReview).not.toHaveBeenCalled();
  });

  it("survives a store that rejects", async () => {
    const s = memory();
    recordShellLaunch(s, T0);
    const { outcomes } = await plans(s, T0 + 30 * DAY, 3, {
      requestReview: vi.fn(() => Promise.reject(new Error("no Play Store"))),
    });
    expect(outcomes.at(-1)).toBe("requested");
  });
});

describe("first launch of a reader coming from the former Android app", () => {
  it("is the launch of the new app, never a date brought across", async () => {
    // The former app's storage, sent back by /transfert, carries an old date
    // under the rating key (a crafted or future payload: the TWA never wrote
    // it). The import must not write it.
    const longAgo = T0 - 400 * DAY;
    const s = memory({
      [LOCAL_STORAGE_KEYS.shellImport]: JSON.stringify({ state: "pending", nonce: "n".repeat(32), at: T0 }),
    });
    const payload = encodePayload({
      [LOCAL_STORAGE_KEYS.customSpots]: "[]",
      [KEY]: JSON.stringify({ firstLaunchAt: longAgo, plans: 50 }),
    });
    const shell = { storage: s, now: () => T0, reload: vi.fn() } as unknown as ShellDeps;
    expect(handleReturnUrl(`ohmywind://import?v=1&n=${"n".repeat(32)}&d=${payload}`, shell)).toBe("imported");
    expect(s.getItem(LOCAL_STORAGE_KEYS.customSpots)).toBe("[]");
    expect(s.getItem(KEY)).toBeNull();

    // The shell records its own first launch, and three plans the next day
    // ask nothing, as for a brand new reader.
    recordShellLaunch(s, T0);
    const soon = await plans(s, T0 + 1 * DAY, 3);
    expect(soon.d.requestReview).not.toHaveBeenCalled();
    const due = await plans(s, T0 + REVIEW_RULES.minDaysSinceFirstLaunch * DAY, 1);
    expect(due.d.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe("isDue", () => {
  it("needs all three conditions", () => {
    const base = { firstLaunchAt: T0, plans: 3 };
    expect(isDue(base, T0 + 14 * DAY, "2.0.0")).toBe(true);
    expect(isDue({ ...base, plans: 2 }, T0 + 14 * DAY, "2.0.0")).toBe(false);
    expect(isDue(base, T0 + 13 * DAY, "2.0.0")).toBe(false);
    expect(isDue({ ...base, askedVersion: "2.0.0" }, T0 + 14 * DAY, "2.0.0")).toBe(false);
  });
});

describe("isTypingIn", () => {
  const el = (tagName: string, type?: string, editable = false) =>
    ({ activeElement: { tagName, isContentEditable: editable, getAttribute: () => type ?? null } }) as unknown as Document;

  it("sees text fields and editable content", () => {
    expect(isTypingIn(el("INPUT"))).toBe(true);
    expect(isTypingIn(el("INPUT", "search"))).toBe(true);
    expect(isTypingIn(el("TEXTAREA"))).toBe(true);
    expect(isTypingIn(el("DIV", undefined, true))).toBe(true);
  });

  it("ignores buttons, checkboxes and the body", () => {
    expect(isTypingIn(el("BUTTON"))).toBe(false);
    expect(isTypingIn(el("INPUT", "checkbox"))).toBe(false);
    expect(isTypingIn(el("BODY"))).toBe(false);
    expect(isTypingIn({ activeElement: null } as unknown as Document)).toBe(false);
  });
});
