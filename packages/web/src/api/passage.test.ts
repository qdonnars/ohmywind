// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, formatRetryDelay, friendlyError } from "./passage";
import { ApiShapeError } from "./parse";

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
      return { ok: true, json: async () => [{ slug: "cruiser_30ft", name: "Croiseur 30 pieds" }] };
    });
    const { fetchArchetypes } = await freshModule();
    const [a, b] = await Promise.all([fetchArchetypes(), fetchArchetypes()]);
    expect(calls).toBe(1);
    expect(a).toEqual([{ slug: "cruiser_30ft", name: "Croiseur 30 pieds" }]);
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
      return { ok: true, json: async () => [{ slug: "cruiser_30ft", name: "Croiseur 30 pieds" }] };
    });
    const { fetchArchetypes } = await freshModule();
    await expect(fetchArchetypes()).rejects.toThrow("HTTP 503");
    await expect(fetchArchetypes()).resolves.toEqual([
      { slug: "cruiser_30ft", name: "Croiseur 30 pieds" },
    ]);
    expect(calls).toBe(2);
  });
});

// The server is gaining a stable `code` next to `error` (GO 3 du plan de
// rework). Until it ships everywhere, both paths have to produce the same
// sentence: a deployment answering without a code must not degrade.
describe("error contract: code first, English text as fallback", () => {
  const cases: { code: string; text: string; expect: RegExp }[] = [
    { code: "forecast_horizon", text: "forecast horizon exceeded", expect: /date plus proche/ },
    { code: "too_few_waypoints", text: "at least 2 waypoints required", expect: /au moins 2 waypoints/ },
    {
      code: "waypoint_out_of_range",
      text: "waypoint 1: lat=99 out of range",
      expect: /hors des coordonnées valides/,
    },
    { code: "too_many_waypoints", text: "too many waypoints", expect: /Trop de waypoints/ },
    { code: "unknown_archetype", text: 'unknown archetype: "yacht"', expect: /Type de bateau inconnu/ },
    { code: "invalid_datetime", text: "invalid departure", expect: /Date invalide/ },
    {
      code: "naive_datetime",
      text: "target_arrival must be timezone-aware",
      expect: /fuseau horaire/,
    },
    {
      code: "sweep_too_large",
      text: "sweep would produce 400 windows",
      expect: /Trop de créneaux/,
    },
    {
      code: "upstream_timeout",
      text: "upstream weather service did not respond in time",
      expect: /trop de temps à répondre/,
    },
    {
      code: "upstream_rate_limited",
      text: "upstream weather service rate limit reached",
      expect: /pas lié à votre usage/,
    },
  ];

  it.each(cases)("says the same thing for $code with or without the code", (c) => {
    const fromText = friendlyError(c.text);
    const fromCode = friendlyError(new ApiError("peu importe le texte", c.code, null));
    expect(fromText).toMatch(c.expect);
    expect(fromCode).toBe(fromText);
  });

  it("carries the retry delay through the code path", () => {
    const msg = friendlyError(new ApiError("rate limited", "rate_limited", 240));
    expect(msg).toContain("Trop de calculs");
    expect(msg).toContain("4 minutes");
  });

  it("stays vague when the code comes without a delay", () => {
    const msg = friendlyError(new ApiError("rate limited", "rate_limited", null));
    expect(msg).toContain("quelques minutes");
    expect(msg).not.toMatch(/\d/);
  });

  it("has copy for the two codes with no text equivalent yet", () => {
    expect(friendlyError(new ApiError("too large", "body_too_large", null))).toMatch(
      /trop détaillée/,
    );
    expect(
      friendlyError(new ApiError("bad cache", "invalid_forecast_cache", null)),
    ).toMatch(/données météo préparées/);
  });

  it("falls back to the text when the code is one we do not know", () => {
    const msg = friendlyError(new ApiError("at least 2 waypoints required", "code_du_futur", null));
    expect(msg).toMatch(/au moins 2 waypoints/);
  });

  it("returns the raw message when nothing matches at all", () => {
    expect(friendlyError("quelque chose d'inédit")).toBe("quelque chose d'inédit");
  });

  it("has its own sentence for a body that is not the contract", () => {
    expect(friendlyError(new ApiShapeError("passage.segments", "tableau attendu"))).toMatch(
      /réponse inattendue/,
    );
  });
});

describe("toError", () => {
  /** Minimal stand-in: only what `toError` reads. */
  function response(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
      ok: false,
      status,
      headers: { get: (k: string) => headers[k] ?? null },
      json: async () => body,
    } as unknown as Response;
  }

  async function failWith(res: Response): Promise<ApiError> {
    vi.stubGlobal("fetch", async () => res);
    const { fetchPassage } = await import("./passage");
    try {
      await fetchPassage({
        waypoints: [[43, 5], [43.1, 5.1]],
        departure: "2026-09-04T08:00:00+02:00",
        archetype: "cruiser_30ft",
      });
    } catch (e) {
      return e as ApiError;
    }
    throw new Error("expected a rejection");
  }

  it("reads the code and the delay out of the JSON body", async () => {
    const error = await failWith(
      response(429, { error: "rate limit exceeded", code: "rate_limited", retry_after: 90 }),
    );
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfter).toBe(90);
    expect(friendlyError(error)).toContain("2 minutes");
  });

  it("still falls back to the Retry-After header on a 429 without a body field", async () => {
    const error = await failWith(
      response(429, { error: "rate limit exceeded, retry shortly" }, { "Retry-After": "240" }),
    );
    expect(error.code).toBeNull();
    expect(error.retryAfter).toBe(240);
    // The text path has to find the delay too, since there is no code.
    expect(friendlyError(error)).toContain("4 minutes");
  });

  it("names the status when the body carries nothing usable", async () => {
    const error = await failWith(response(503, "<html>gateway</html>"));
    expect(error.message).toContain("Erreur serveur 503");
    expect(friendlyError(error)).toMatch(/indisponible/);
  });
});

// Une requete qui n'atteint jamais de serveur n'a pas de corps a lire : elle
// rejette avec l'erreur du moteur du navigateur, en anglais, et c'est ce
// texte brut qui s'affichait ("Failed to fetch"). C'est pourtant le cas le
// plus frequent en mer, ou le reseau tombe pour de bon.
describe("panne de transport", () => {
  const sentence = "Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.";

  it("reconnait le rejet de fetch de chaque moteur", () => {
    // Chrome, Firefox, Safari, undici (Node) : meme panne, quatre libelles.
    for (const message of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "fetch failed",
    ]) {
      expect(friendlyError(new TypeError(message))).toBe(sentence);
    }
  });

  it("reconnait un delai depasse et un abandon", () => {
    const timeout = new Error("signal timed out");
    timeout.name = "TimeoutError";
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(friendlyError(timeout)).toBe(sentence);
    expect(friendlyError(aborted)).toBe(sentence);
  });

  it("laisse passer un TypeError qui n'a rien a voir avec le reseau", () => {
    // Un bug a nous ne doit pas se deguiser en probleme de connexion : le
    // message d'origine reste lisible pour qui debogue.
    const bug = new TypeError("x.map is not a function");
    expect(friendlyError(bug)).toBe("x.map is not a function");
  });

  it("laisse la priorite au contrat d'erreur du serveur", () => {
    // Un serveur qui a repondu a toujours raison sur la cause.
    const answered = new ApiError("rate limit exceeded", "rate_limited", 60);
    expect(friendlyError(answered)).toContain("Trop de calculs");
  });
});
