// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
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

// The two rate limits must never be confused in the UI. Ours is about the
// caller's pace and slowing down fixes it. Open-Meteo's is counted per egress
// IP and can be spent by another tenant of the same host, so telling the user
// to slow down would be both wrong and useless.
describe("upstream vs own rate limit", () => {
  it("blames nobody when the weather service throttles us", () => {
    const msg = friendlyError("upstream weather service rate limit reached (Daily API request limit exceeded.)");
    expect(msg).toContain("service météo");
    expect(msg).toContain("pas lié à votre usage");
    expect(msg).not.toContain("Trop de calculs");
  });

  it("still blames the pace when it is our own limiter", () => {
    const msg = friendlyError("rate limit exceeded, retry shortly, retry in 30s");
    expect(msg).toContain("Trop de calculs");
    expect(msg).not.toContain("service météo");
  });
});

// The boat catalogue is static for the life of a deploy. It used to be
// refetched on every mount of /plan, which on a phone meant a 0.6 s round trip
// each time the user came back from the explore map.
describe("fetchArchetypes", () => {
  /** A fresh module instance, so the session cache starts empty. */
  async function freshModule() {
    vi.resetModules();
    return import("./passage");
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the server once per session, however many callers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return { ok: true, json: async () => [{ slug: "cruiser_30ft" }] };
    });
    const { fetchArchetypes } = await freshModule();
    const [a, b] = await Promise.all([fetchArchetypes(), fetchArchetypes()]);
    expect(calls).toBe(1);
    expect(a).toEqual([{ slug: "cruiser_30ft" }]);
    // Same list handed to both callers, not two parses of the same bytes.
    expect(b).toBe(a);
    await fetchArchetypes();
    expect(calls).toBe(1);
  });

  it("retries after a failure rather than caching the rejection", async () => {
    // The Space sleeps. A cold start must not cost the user the catalogue for
    // the rest of their session.
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503 };
      return { ok: true, json: async () => [{ slug: "cruiser_30ft" }] };
    });
    const { fetchArchetypes } = await freshModule();
    await expect(fetchArchetypes()).rejects.toThrow("HTTP 503");
    await expect(fetchArchetypes()).resolves.toEqual([{ slug: "cruiser_30ft" }]);
    expect(calls).toBe(2);
  });
});
