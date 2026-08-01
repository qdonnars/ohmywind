import { describe, expect, it } from "vitest";
import { formatRetryDelay, friendlyError } from "./passage";

// Regression guard for the dev incident of 2026-08-01: the rate-limit copy
// hard-coded "une minute" while the server ran a 300 s window, so the user
// waited a minute, retried, and got the exact same message. The delay must
// always come from the server's Retry-After, never from a constant here.
describe("rate-limit copy", () => {
  it("reports the delay the server actually asked for", () => {
    const msg = friendlyError("rate limit exceeded, retry shortly, retry in 240s");
    expect(msg).toContain("4 minutes");
    expect(msg).not.toContain("une minute");
  });

  it("never hard-codes a delay when the server sent none", () => {
    const msg = friendlyError("rate limit exceeded, retry shortly");
    // Vague on purpose: guessing is what produced a message that contradicted
    // the server. Anything numeric here would be invented.
    expect(msg).toContain("quelques minutes");
    expect(msg).not.toMatch(/\d/);
  });

  it("still recognises the rate-limit case at all", () => {
    const msg = friendlyError("rate limit exceeded, retry shortly");
    expect(msg).toContain("Trop de calculs");
  });
});

describe("formatRetryDelay", () => {
  it("uses seconds below a minute", () => {
    expect(formatRetryDelay(45)).toBe("Patientez 45 secondes avant de relancer.");
  });

  it("rounds minutes up so the retry cannot be premature", () => {
    // 250 s is 4 min 10 s: rounding down would send the user back one message
    // too early, which is the failure mode this whole change exists to kill.
    expect(formatRetryDelay(250)).toBe("Patientez 5 minutes avant de relancer.");
  });

  it("keeps the singular for exactly one minute", () => {
    expect(formatRetryDelay(60)).toBe("Patientez 1 minute avant de relancer.");
  });

  it("falls back when the header is absent or nonsensical", () => {
    for (const value of [null, 0, -5, Number.NaN]) {
      expect(formatRetryDelay(value)).toBe("Patientez quelques minutes avant de relancer.");
    }
  });
});
