// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import type { MobilePlatform } from "./stores";

/**
 * When the site, opened on a phone, invites the reader to install the app.
 *
 * Who: a phone's browser, outside any app (store app or installed PWA), on a
 * platform whose store link is filled in. When: never in the first seconds,
 * and only at a quiet moment, so the sheet never lands on a gesture or a
 * route being drawn. How often: once, then not again for
 * `INVITE_SNOOZE_DAYS` after either answer.
 *
 * Pure functions over plain values; `InstallInvite.tsx` reads the browser.
 */

/** How long an answer keeps the invitation away. The one place it is set. */
export const INVITE_SNOOZE_DAYS = 30;

/** Time on the site before the invitation may show: the reader came for the
    forecast, and gets to read it first. */
export const INVITE_FIRST_DELAY_MS = 20_000;

/** Quiet needed since the last touch, key or wheel before it shows. */
export const INVITE_QUIET_MS = 4_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = LOCAL_STORAGE_KEYS.installInvite;

export interface InviteEnv {
  platform: MobilePlatform | null;
  /** Running in the shell, the TWA, or an installed PWA. */
  installed: boolean;
  storeUrls: Readonly<Record<MobilePlatform, string>>;
  /** Last answer, epoch ms, or null if never answered. */
  answeredAt: number | null;
  now: number;
}

/**
 * Whether a past answer still holds. A date slightly in the future (a clock
 * set back) still counts; one absurdly far ahead does not, or a bad clock
 * would silence the invitation forever.
 */
export function isSnoozed(answeredAt: number | null, now: number): boolean {
  if (answeredAt === null) return false;
  const age = now - answeredAt;
  return age > -DAY_MS && age < INVITE_SNOOZE_DAYS * DAY_MS;
}

/** The store page to offer, or null when the invitation must not show. */
export function inviteStoreUrl(env: InviteEnv): string | null {
  if (env.installed || env.platform === null) return null;
  const url = env.storeUrls[env.platform].trim();
  if (url === "") return null;
  if (isSnoozed(env.answeredAt, env.now)) return null;
  return url;
}

export interface Moment {
  /** Time since the page loaded. */
  sinceLoadMs: number;
  /** Time since the last pointer, key or wheel event. */
  sinceInputMs: number;
  /** Panels open over the page (`backStack.depth`). */
  layersOpen: number;
  /** A route drawn on the planner and not computed yet. */
  drafting: boolean;
  /** Another dialog on screen: the planner hint, a spot dialog... */
  otherDialog: boolean;
  /** Focus in a text field: the reader is typing a search. */
  typing: boolean;
  /** The tab is in the foreground. */
  visible: boolean;
}

/** Whether now is a moment the sheet can show without cutting anything short. */
export function isQuietMoment(m: Moment): boolean {
  return (
    m.visible &&
    m.sinceLoadMs >= INVITE_FIRST_DELAY_MS &&
    m.sinceInputMs >= INVITE_QUIET_MS &&
    m.layersOpen === 0 &&
    !m.drafting &&
    !m.otherDialog &&
    !m.typing
  );
}

export function parseAnsweredAt(raw: string | null): number | null {
  if (raw === null) return null;
  const at = Number(raw);
  return Number.isFinite(at) && at > 0 ? at : null;
}

export function readAnsweredAt(): number | null {
  try {
    return parseAnsweredAt(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveAnsweredAt(now: number): void {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    /* storage blocked: the answer holds for this visit only */
  }
}
