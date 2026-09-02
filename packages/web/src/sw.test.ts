// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { shouldApplyUpdateNow, shouldCheckForUpdate } from "./sw";

describe("shouldCheckForUpdate", () => {
  it("checks on the first navigation of a session", () => {
    expect(shouldCheckForUpdate(1_000_000, 0)).toBe(true);
  });

  it("skips a burst of navigations", () => {
    // Back, forward, back in a few seconds must not fire three requests.
    const now = 1_000_000;
    expect(shouldCheckForUpdate(now + 2_000, now)).toBe(false);
    expect(shouldCheckForUpdate(now + 59_000, now)).toBe(false);
  });

  it("checks again once the interval has elapsed", () => {
    const now = 1_000_000;
    expect(shouldCheckForUpdate(now + 60_000, now)).toBe(true);
    expect(shouldCheckForUpdate(now + 600_000, now)).toBe(true);
  });
});

describe("shouldApplyUpdateNow", () => {
  it("swaps straight away when nothing is being drafted", () => {
    expect(shouldApplyUpdateNow("found", false)).toBe(true);
  });

  it("waits when a route is half drawn", () => {
    // The whole point: a deploy must not reload the page under a reader who
    // has placed waypoints and not computed them yet.
    expect(shouldApplyUpdateNow("found", true)).toBe(false);
  });

  it("swaps once the tab is in the background, draft or not", () => {
    expect(shouldApplyUpdateNow("hidden", true)).toBe(true);
    expect(shouldApplyUpdateNow("hidden", false)).toBe(true);
  });

  it("swaps on the next in-app navigation, draft or not", () => {
    // The reader is leaving the view anyway, and the draft is persisted.
    expect(shouldApplyUpdateNow("navigation", true)).toBe(true);
    expect(shouldApplyUpdateNow("navigation", false)).toBe(true);
  });
});
