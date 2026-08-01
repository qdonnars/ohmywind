import { describe, it, expect } from "vitest";
import { shouldCheckForUpdate } from "./sw";

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
