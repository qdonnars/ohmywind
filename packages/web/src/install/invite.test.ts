// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import {
  INVITE_FIRST_DELAY_MS,
  INVITE_QUIET_MS,
  INVITE_SNOOZE_DAYS,
  inviteStoreUrl,
  isQuietMoment,
  isSnoozed,
  parseAnsweredAt,
  type InviteEnv,
  type Moment,
} from "./invite";
import { STORE_URLS } from "./stores";
import { TRANSFER_POLICY } from "../storage/transfer";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24, 12);
const PLAY = "https://play.google.com/store/apps/details?id=fr.ohmywind.app";
const APPLE = "https://apps.apple.com/app/id0000000000";

const env = (over: Partial<InviteEnv> = {}): InviteEnv => ({
  platform: "android",
  installed: false,
  storeUrls: { android: PLAY, ios: "" },
  answeredAt: null,
  now: NOW,
  ...over,
});

describe("inviteStoreUrl", () => {
  it("offers the Play page in an Android browser", () => {
    expect(inviteStoreUrl(env())).toBe(PLAY);
  });

  it("stays hidden on iOS while the App Store link is empty, and offers it once filled", () => {
    expect(inviteStoreUrl(env({ platform: "ios" }))).toBeNull();
    expect(inviteStoreUrl(env({ platform: "ios", storeUrls: { android: PLAY, ios: "  " } }))).toBeNull();
    expect(inviteStoreUrl(env({ platform: "ios", storeUrls: { android: PLAY, ios: APPLE } }))).toBe(APPLE);
  });

  it("never shows on a computer", () => {
    expect(inviteStoreUrl(env({ platform: null }))).toBeNull();
  });

  it("never shows inside an app, store app or installed PWA", () => {
    expect(inviteStoreUrl(env({ installed: true }))).toBeNull();
  });

  it(`stays away ${INVITE_SNOOZE_DAYS} days after an answer, then comes back`, () => {
    expect(inviteStoreUrl(env({ answeredAt: NOW - DAY }))).toBeNull();
    expect(inviteStoreUrl(env({ answeredAt: NOW - (INVITE_SNOOZE_DAYS * DAY - 1) }))).toBeNull();
    expect(inviteStoreUrl(env({ answeredAt: NOW - INVITE_SNOOZE_DAYS * DAY }))).toBe(PLAY);
  });

  it("ships with the Play link and no App Store link yet", () => {
    expect(STORE_URLS.android).toBe(PLAY);
    expect(inviteStoreUrl(env({ storeUrls: STORE_URLS }))).toBe(PLAY);
    expect(inviteStoreUrl(env({ platform: "ios", storeUrls: STORE_URLS }))).toBeNull();
  });
});

describe("isSnoozed", () => {
  it("holds for a clock set back a little, not for a date years ahead", () => {
    expect(isSnoozed(NOW + 60 * 60 * 1000, NOW)).toBe(true);
    expect(isSnoozed(NOW + 400 * DAY, NOW)).toBe(false);
  });

  it("is false when never answered", () => {
    expect(isSnoozed(null, NOW)).toBe(false);
  });
});

describe("parseAnsweredAt", () => {
  it("reads a stored timestamp and rejects anything else", () => {
    expect(parseAnsweredAt(String(NOW))).toBe(NOW);
    expect(parseAnsweredAt(null)).toBeNull();
    expect(parseAnsweredAt("")).toBeNull();
    expect(parseAnsweredAt("soon")).toBeNull();
    expect(parseAnsweredAt("-5")).toBeNull();
  });
});

describe("isQuietMoment", () => {
  const quiet: Moment = {
    sinceLoadMs: INVITE_FIRST_DELAY_MS,
    sinceInputMs: INVITE_QUIET_MS,
    layersOpen: 0,
    drafting: false,
    otherDialog: false,
    typing: false,
    visible: true,
  };

  it("is quiet once the first delay is over and nothing is going on", () => {
    expect(isQuietMoment(quiet)).toBe(true);
  });

  it("never in the first seconds", () => {
    expect(isQuietMoment({ ...quiet, sinceLoadMs: 1_000 })).toBe(false);
    expect(INVITE_FIRST_DELAY_MS).toBeGreaterThanOrEqual(5_000);
  });

  it.each<[string, Partial<Moment>]>([
    ["a gesture just now", { sinceInputMs: 500 }],
    ["a panel open", { layersOpen: 1 }],
    ["a route being drawn", { drafting: true }],
    ["another dialog on screen", { otherDialog: true }],
    ["a search being typed", { typing: true }],
    ["the tab in the background", { visible: false }],
  ])("not with %s", (_what, over) => {
    expect(isQuietMoment({ ...quiet, ...over })).toBe(false);
  });
});

describe("storage", () => {
  it("does not carry the answer into the app with the reader's data", () => {
    expect(TRANSFER_POLICY.installInvite).toEqual({ transfer: false });
  });
});
