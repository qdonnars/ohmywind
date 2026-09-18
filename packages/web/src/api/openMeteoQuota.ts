// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { t, tn } from "../i18n";

/**
 * Open-Meteo's free tier, and what to say when it runs out.
 *
 * The forecasts on the explore page, the corridor the planner samples and
 * the compare table all come straight from Open-Meteo, over the reader's own
 * connection. The free tier counts requests per IP address on three
 * counters: 600 a minute, 5 000 an hour, 10 000 a day. Past one of them the
 * API answers 429 with a body naming the counter ("Daily API request limit
 * exceeded. Please try again tomorrow.") and no Retry-After header.
 *
 * The counters are cleared by a sweep that runs once a minute, on a fixed
 * clock rather than a rolling window: the minutely ones on every sweep, the
 * hourly ones on the first sweep of each hour, the daily ones on the first
 * sweep of each UTC day (Sources/App/Helper/Vapor/RateLimiter.swift in
 * open-meteo/open-meteo). So the moment a counter clears is computable, and
 * that is what lets the message say "resets in about three hours" instead
 * of "try again later": refused at 21:30 UTC, the daily quota is back at
 * 00:01 UTC, not the next evening.
 *
 * Per IP, so a whole marina on one wifi, or a household behind carrier NAT,
 * shares the counter: the copy says "your connection", not "you".
 *
 * The same refusal can hit our own server, whose egress IP is shared with
 * every other tenant of the host; the API then answers 503
 * `upstream_rate_limited` carrying the window and the wait (see
 * `passage.ts`). The sentence differs by one clause, so both sides read the
 * same function.
 *
 * One module-level store rather than a value threaded through the fetchers:
 * the refusal reaches four fetchers and three screens, and the screens never
 * call the fetchers directly. In memory only, on purpose: a page reload
 * starts fresh, which is the right recovery if the store ever disagrees with
 * the API. Nothing is short-circuited on it either. Open-Meteo counts on
 * each of its nodes separately, so the next request may well land on one
 * with room left; a refused request costs nothing against the quota; and a
 * fetch that is still tried is the only way to learn the quota is back
 * early. What the fetchers do stop is the walk down the fallback models
 * after a refusal, which was up to a dozen requests refused in a row.
 */

export type QuotaWindow = "minute" | "hour" | "day";

const WINDOW_PERIOD_MS: Record<QuotaWindow, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** The limiter's sweep interval: a counter can outlive its boundary by this much. */
export const QUOTA_SWEEP_MS = 60_000;

export function isQuotaWindow(value: unknown): value is QuotaWindow {
  return value === "minute" || value === "hour" || value === "day";
}

/**
 * The counter a 429 body names, or null when it names none.
 *
 * Reads Open-Meteo's own wording ("Minutely API request limit exceeded.",
 * "Hourly ...", "Daily ..."). A refusal naming none of them ("Too many
 * concurrent requests", a proxy's HTML page) is momentary and not worth a
 * sentence about quotas.
 */
export function quotaWindowOf(body: unknown): QuotaWindow | null {
  if (typeof body !== "object" || body === null) return null;
  const reason = (body as { reason?: unknown }).reason;
  if (typeof reason !== "string") return null;
  const lowered = reason.toLowerCase();
  if (lowered.includes("minutely")) return "minute";
  if (lowered.includes("hourly")) return "hour";
  if (lowered.includes("daily")) return "day";
  return null;
}

/**
 * Epoch milliseconds at which the counter `window` clears, for a refusal
 * seen at `now`. Includes the sweep margin, so the number never runs out
 * before the counter does: told to wait three hours, the reader must not
 * come back to the same refusal.
 */
export function quotaResetAt(window: QuotaWindow, now: number = Date.now()): number {
  // Cleared on every sweep, wherever the clock stands.
  if (window === "minute") return now + QUOTA_SWEEP_MS;
  const period = WINDOW_PERIOD_MS[window];
  // Epoch time is UTC, so `now % period` is the time since the last UTC
  // boundary, which is the one Open-Meteo's sweep uses.
  return now - (now % period) + period + QUOTA_SWEEP_MS;
}

export interface QuotaExhaustion {
  readonly window: QuotaWindow;
  /** Epoch ms at which the counter clears. */
  readonly resetAt: number;
}

let state: QuotaExhaustion | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Record a 429 from Open-Meteo. Returns the window the body named, or null
 * when it named none, in which case nothing is recorded.
 *
 * A longer wait already recorded is kept: a daily refusal outranks an hourly
 * one, and the daily counter does not clear because the minutely one did.
 */
export function noteOpenMeteoRefusal(body: unknown, now: number = Date.now()): QuotaWindow | null {
  const window = quotaWindowOf(body);
  if (window === null) return null;
  const resetAt = quotaResetAt(window, now);
  if (state !== null && state.resetAt > now && state.resetAt >= resetAt) return window;
  state = { window, resetAt };
  notify();
  return window;
}

/**
 * If `resp` is a 429 from Open-Meteo, record it and answer true. The body is
 * consumed, which is fine: a refusal carries no forecast.
 */
export async function noteIfRefused(resp: Response, now: number = Date.now()): Promise<boolean> {
  if (resp.status !== 429) return false;
  const body: unknown = await resp.json().catch(() => null);
  noteOpenMeteoRefusal(body, now);
  return true;
}

/** The exhaustion in force at `now`, or null once its counter has cleared. */
export function openMeteoQuota(now: number = Date.now()): QuotaExhaustion | null {
  if (state !== null && state.resetAt <= now) state = null;
  return state;
}

export function subscribeOpenMeteoQuota(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test seam: forget any refusal. Not used by the app. */
export function clearOpenMeteoQuota(): void {
  state = null;
  notify();
}

/**
 * "Resets in about 3 hours." for the reader, from the moment the counter
 * clears. Rounds up, like `formatRetryDelay`: a wait that reads shorter than
 * it is earns a second refusal.
 */
export function formatQuotaReset(resetAt: number, now: number = Date.now()): string {
  const seconds = (resetAt - now) / 1000;
  if (seconds < 60) return t("common.quota.reset.soon");
  if (seconds < 3600) return tn("common.quota.reset.minutes", Math.ceil(seconds / 60));
  return tn("common.quota.reset.hours", Math.ceil(seconds / 3600));
}

/**
 * The whole sentence: which quota, whose connection, and when it is back.
 *
 * `side` is who Open-Meteo refused. "connection" is the reader's own IP, the
 * case on the explore and compare pages; "server" is our egress IP, the
 * case behind an `upstream_rate_limited` answer, where the sentence adds
 * that the reader's own usage has nothing to do with it.
 */
export function openMeteoQuotaMessage(
  side: "connection" | "server",
  window: QuotaWindow,
  resetAt: number,
  now: number = Date.now(),
): string {
  const key = side === "server" ? "common.quota.server" : "common.quota.connection";
  return t(key, {
    window: t(`common.quota.window.${window}`),
    reset: formatQuotaReset(resetAt, now),
  });
}
