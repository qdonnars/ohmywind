// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUOTA_SWEEP_MS,
  clearOpenMeteoQuota,
  formatQuotaReset,
  noteIfRefused,
  noteOpenMeteoRefusal,
  openMeteoQuota,
  openMeteoQuotaMessage,
  quotaResetAt,
  quotaWindowOf,
  subscribeOpenMeteoQuota,
} from "./openMeteoQuota";

// Shape of a real Open-Meteo refusal: the body names the counter that tripped.
const MINUTELY = {
  error: true,
  reason: "Minutely API request limit exceeded. Please try again in one minute.",
};
const HOURLY = {
  error: true,
  reason: "Hourly API request limit exceeded. Please try again in the next hour.",
};
const DAILY = { error: true, reason: "Daily API request limit exceeded. Please try again tomorrow." };

const T = (iso: string) => new Date(iso).getTime();

describe("quotaWindowOf", () => {
  it("reads the counter off Open-Meteo's wording", () => {
    expect(quotaWindowOf(MINUTELY)).toBe("minute");
    expect(quotaWindowOf(HOURLY)).toBe("hour");
    expect(quotaWindowOf(DAILY)).toBe("day");
  });

  it("names nothing for a momentary refusal or a body that is not Open-Meteo's", () => {
    expect(quotaWindowOf({ error: true, reason: "Too many concurrent requests" })).toBeNull();
    expect(quotaWindowOf("<html>429</html>")).toBeNull();
    expect(quotaWindowOf(null)).toBeNull();
    expect(quotaWindowOf({})).toBeNull();
  });
});

describe("quotaResetAt", () => {
  // Fixed clocks, not rolling windows: the daily counter clears at 00:00 UTC
  // plus one sweep of the limiter, whatever the hour of the refusal.
  it("clears the daily counter at midnight UTC, not a day later", () => {
    expect(quotaResetAt("day", T("2026-09-13T21:30:00Z"))).toBe(
      T("2026-09-14T00:00:00Z") + QUOTA_SWEEP_MS,
    );
  });

  it("clears the hourly counter at the next full hour", () => {
    expect(quotaResetAt("hour", T("2026-09-13T10:20:30Z"))).toBe(
      T("2026-09-13T11:00:00Z") + QUOTA_SWEEP_MS,
    );
  });

  it("clears the minutely counter within one sweep", () => {
    const now = T("2026-09-13T10:20:59Z");
    expect(quotaResetAt("minute", now)).toBe(now + QUOTA_SWEEP_MS);
  });
});

describe("the store", () => {
  beforeEach(() => clearOpenMeteoQuota());
  afterEach(() => vi.restoreAllMocks());

  it("starts empty and records a refusal that names a counter", () => {
    const now = T("2026-09-13T21:30:00Z");
    expect(openMeteoQuota(now)).toBeNull();
    expect(noteOpenMeteoRefusal(DAILY, now)).toBe("day");
    expect(openMeteoQuota(now)).toEqual({ window: "day", resetAt: quotaResetAt("day", now) });
  });

  it("records nothing for a refusal that names no counter", () => {
    const now = T("2026-09-13T21:30:00Z");
    expect(noteOpenMeteoRefusal({ reason: "Too many concurrent requests" }, now)).toBeNull();
    expect(openMeteoQuota(now)).toBeNull();
  });

  it("forgets the refusal once its counter has cleared", () => {
    const now = T("2026-09-13T10:20:30Z");
    noteOpenMeteoRefusal(HOURLY, now);
    expect(openMeteoQuota(T("2026-09-13T11:00:59Z"))).not.toBeNull();
    expect(openMeteoQuota(T("2026-09-13T11:01:00Z"))).toBeNull();
  });

  it("keeps the longer wait: a minutely refusal does not shorten a daily one", () => {
    const now = T("2026-09-13T21:30:00Z");
    noteOpenMeteoRefusal(DAILY, now);
    noteOpenMeteoRefusal(MINUTELY, now + 1000);
    expect(openMeteoQuota(now + 2000)?.window).toBe("day");
  });

  it("lets a daily refusal replace an hourly one", () => {
    const now = T("2026-09-13T21:30:00Z");
    noteOpenMeteoRefusal(HOURLY, now);
    noteOpenMeteoRefusal(DAILY, now + 1000);
    expect(openMeteoQuota(now + 2000)?.window).toBe("day");
  });

  it("notifies subscribers on a new refusal, not on a repeat of a shorter one", () => {
    const now = T("2026-09-13T21:30:00Z");
    const fn = vi.fn();
    const unsubscribe = subscribeOpenMeteoQuota(fn);
    noteOpenMeteoRefusal(DAILY, now);
    noteOpenMeteoRefusal(MINUTELY, now + 1000);
    expect(fn).toHaveBeenCalledTimes(1);
    unsubscribe();
    noteOpenMeteoRefusal(DAILY, now + 2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("noteIfRefused records a 429 and leaves every other status alone", async () => {
    const now = T("2026-09-13T21:30:00Z");
    const refusal = { status: 429, json: async () => DAILY } as unknown as Response;
    const fine = { status: 200, json: async () => ({ hourly: {} }) } as unknown as Response;
    expect(await noteIfRefused(fine, now)).toBe(false);
    expect(openMeteoQuota(now)).toBeNull();
    expect(await noteIfRefused(refusal, now)).toBe(true);
    expect(openMeteoQuota(now)?.window).toBe("day");
  });

  it("noteIfRefused survives a 429 whose body is not JSON", async () => {
    const refusal = {
      status: 429,
      json: async () => {
        throw new SyntaxError("not json");
      },
    } as unknown as Response;
    expect(await noteIfRefused(refusal)).toBe(true);
    expect(openMeteoQuota()).toBeNull();
  });
});

describe("the sentence, in French", () => {
  const now = T("2026-09-13T21:30:00Z");

  it("rounds the wait up, in hours past one hour", () => {
    expect(formatQuotaReset(now + 2.5 * 3600_000, now)).toBe(
      "Réinitialisation dans 3 heures environ.",
    );
    expect(formatQuotaReset(now + 3600_000, now)).toBe("Réinitialisation dans 1 heure environ.");
  });

  it("counts minutes under an hour, and says so under a minute", () => {
    expect(formatQuotaReset(now + 25 * 60_000 + 1, now)).toBe(
      "Réinitialisation dans 26 minutes.",
    );
    expect(formatQuotaReset(now + 30_000, now)).toBe(
      "Réinitialisation dans moins d'une minute.",
    );
  });

  it("names the quota and whose connection it is", () => {
    const resetAt = quotaResetAt("day", now);
    expect(openMeteoQuotaMessage("connection", "day", resetAt, now)).toBe(
      "Le service météo gratuit (Open-Meteo) a atteint sa limite de requêtes par jour pour votre connexion. Réinitialisation dans 3 heures environ.",
    );
    const server = openMeteoQuotaMessage("server", "hour", quotaResetAt("hour", now), now);
    expect(server).toContain("par heure pour notre serveur");
    expect(server).toContain("Ce n'est pas lié à votre usage.");
    expect(server).toContain("Réinitialisation dans 31 minutes.");
  });
});
