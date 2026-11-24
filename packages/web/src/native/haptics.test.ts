// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { waypointPlacedFeedback, type HapticsEnv } from "./haptics";

function env(over: Partial<HapticsEnv>): HapticsEnv {
  return {
    inShell: false,
    nativeImpact: vi.fn(() => Promise.resolve()),
    vibrate: vi.fn(() => true),
    ...over,
  };
}

describe("waypointPlacedFeedback", () => {
  it("uses the native impact inside the app, never the web vibration", () => {
    const e = env({ inShell: true });
    waypointPlacedFeedback(e);
    expect(e.nativeImpact).toHaveBeenCalledTimes(1);
    expect(e.vibrate).not.toHaveBeenCalled();
  });

  it("vibrates briefly in a browser that can", () => {
    const e = env({});
    waypointPlacedFeedback(e);
    expect(e.nativeImpact).not.toHaveBeenCalled();
    expect(e.vibrate).toHaveBeenCalledTimes(1);
    const ms = vi.mocked(e.vibrate!).mock.calls[0][0];
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(20);
  });

  it("does nothing in a browser without vibration", () => {
    expect(() => waypointPlacedFeedback(env({ vibrate: undefined }))).not.toThrow();
  });

  it("swallows a plugin that rejects and a vibration that throws", async () => {
    const rejecting = env({ inShell: true, nativeImpact: () => Promise.reject(new Error("no plugin")) });
    expect(() => waypointPlacedFeedback(rejecting)).not.toThrow();
    await Promise.resolve();
    const throwing = env({
      vibrate: () => {
        throw new Error("policy");
      },
    });
    expect(() => waypointPlacedFeedback(throwing)).not.toThrow();
  });
});
