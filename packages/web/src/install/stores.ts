// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Where each mobile platform installs the app: the one place these links live.
 *
 * An empty string means "not published there yet", and the invitation stays
 * hidden on that platform (see `invite.ts`). The day the iOS app is on the
 * App Store, filling `ios` is the whole change.
 *
 * The press release links the Android page in its Markdown; a test holds
 * those links to this constant, so the two cannot drift apart.
 */

export type MobilePlatform = "android" | "ios";

export const STORE_URLS: Readonly<Record<MobilePlatform, string>> = {
  android: "https://play.google.com/store/apps/details?id=fr.ohmywind.app",
  ios: "",
};

/**
 * Hosts of the stores' web pages. A link to one of them is a mention of a
 * platform, which the store apps must not carry (see `storeMentions.ts`),
 * whether or not the link is the one above.
 */
export const STORE_HOSTS: readonly string[] = ["play.google.com", "apps.apple.com"];
