// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateSweep } from "./validateSweep";

// The horizon rule is relative to now, so the clock is pinned. Everything else
// is pure, but a floating clock would make the horizon cases pass or fail
// depending on the day the suite runs.
const NOW = new Date("2026-06-01T08:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// Local-time strings, the format the datetime-local inputs produce.
function plusHours(h: number): string {
  const d = new Date(NOW.getTime() + h * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("validateSweep", () => {
  it("accepts a plain window inside the horizon", () => {
    expect(validateSweep(plusHours(2), plusHours(26), 3)).toEqual({ ok: true });
  });

  it("asks for a window when either bound is empty", () => {
    expect(validateSweep("", plusHours(26), 3).ok).toBe(false);
    expect(validateSweep(plusHours(2), "", 3).ok).toBe(false);
  });

  it("rejects unparseable dates", () => {
    expect(validateSweep("pas-une-date", plusHours(26), 3).message).toBe("Dates invalides.");
  });

  it("rejects a window that ends before it starts, and one of zero length", () => {
    expect(validateSweep(plusHours(26), plusHours(2), 3).ok).toBe(false);
    expect(validateSweep(plusHours(2), plusHours(2), 3).ok).toBe(false);
  });

  it("refuses a departure past the forecast horizon", () => {
    // 14 d is the cap mirrored from the backend; 15 d is beyond it.
    expect(validateSweep(plusHours(2), plusHours(15 * 24), 6).message).toContain("14 jours");
  });

  it("refuses more windows than the backend accepts, and names the count", () => {
    // 336 h at a 1 h step is 337 windows, one over the cap.
    const result = validateSweep(plusHours(0), plusHours(336), 1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("337");
  });

  it("accepts the same span once the step thins it back under the cap", () => {
    expect(validateSweep(plusHours(0), plusHours(336), 2)).toEqual({ ok: true });
  });
});
