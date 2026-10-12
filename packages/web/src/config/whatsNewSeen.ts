// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The dot on the info button ("i") and on the "Quoi de neuf" entry of its panel.
 *
 * The browser remembers the last version whose release notes it has seen.
 * When the app runs a newer one, the "i" shows a small dot until the page
 * is opened. No modal and no toast: the release log is there for whoever
 * wants it, the dot only says it has grown.
 *
 * A first visit has nothing "new" to point at: everything is. So a browser
 * with no trace of earlier use records the current version silently, and the
 * next release is the first to light the dot. A returning reader from before
 * this feature existed has traces (a spot, a boat, a computed plan) but no
 * recorded version, and does get the dot once.
 */

import { useEffect, useState } from "react";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { APP_VERSION, compareVersions } from "../utils/version";

const SEEN_KEY = LOCAL_STORAGE_KEYS.whatsNewSeen;

/**
 * Keys that only exist once someone has used the app. Deliberately not the
 * theme, the language or the cached atlas coverage: those can be written on
 * a first load, before the reader has done anything.
 */
const TRACES_OF_USE = [
  LOCAL_STORAGE_KEYS.lastSpot,
  LOCAL_STORAGE_KEYS.customSpots,
  LOCAL_STORAGE_KEYS.onboarding,
  LOCAL_STORAGE_KEYS.polarConfig,
  LOCAL_STORAGE_KEYS.modelConfig,
  LOCAL_STORAGE_KEYS.lastSimulation,
  LOCAL_STORAGE_KEYS.compare,
] as const;

/**
 * Whether the dot shows. `seen` is the stored version (null when none),
 * `returning` whether the browser carries traces of earlier use. Only a
 * strictly newer version lights it: going back to an older build after a
 * rollback has nothing new to announce.
 */
export function shouldShowWhatsNewDot(seen: string | null, current: string, returning: boolean): boolean {
  if (seen === null) return returning;
  return compareVersions(current, seen) > 0;
}

interface WhatsNewState {
  /** The dot shows on the "i" and on the panel's entry. */
  dot: boolean;
  /** Nothing stored and no trace of use: record the version, show nothing. */
  firstVisit: boolean;
}

/** Reads the state from `storage`; storage that throws or is missing shows nothing. */
export function readWhatsNewState(storage: Pick<Storage, "getItem"> | null, current: string): WhatsNewState {
  if (!storage) return { dot: false, firstVisit: false };
  try {
    const seen = storage.getItem(SEEN_KEY);
    const returning = TRACES_OF_USE.some((key) => storage.getItem(key) !== null);
    return {
      dot: shouldShowWhatsNewDot(seen, current, returning),
      firstVisit: seen === null && !returning,
    };
  } catch {
    return { dot: false, firstVisit: false };
  }
}

/** Called by the page on opening, and silently on a first visit. */
export function markWhatsNewSeen(version: string = APP_VERSION): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* storage unavailable: the dot is a convenience, not a requirement */
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The dot, read once when the header's "i" mounts. Every page change
 * remounts the header, and opening the page is a page change, so the dot is
 * gone on the way back without anything having to broadcast it.
 */
export function useWhatsNewDot(): boolean {
  const [state] = useState(() => readWhatsNewState(localStorageOrNull(), APP_VERSION));
  useEffect(() => {
    if (state.firstVisit) markWhatsNewSeen();
  }, [state.firstVisit]);
  return state.dot;
}
