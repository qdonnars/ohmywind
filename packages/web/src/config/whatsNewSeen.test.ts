// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { readWhatsNewState, shouldShowWhatsNewDot } from "./whatsNewSeen";

/** A read-only storage holding exactly `entries`. */
function storageWith(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key: string) => entries[key] ?? null };
}

const SEEN = LOCAL_STORAGE_KEYS.whatsNewSeen;

describe("shouldShowWhatsNewDot", () => {
  it("lights for a version newer than the one seen", () => {
    expect(shouldShowWhatsNewDot("1.7.0", "1.8.0", true)).toBe(true);
    expect(shouldShowWhatsNewDot("1.8.0", "1.8.1", false)).toBe(true);
    expect(shouldShowWhatsNewDot("1.9.0", "1.10.0", true)).toBe(true);
  });

  it("stays off once the current version has been seen", () => {
    expect(shouldShowWhatsNewDot("1.8.0", "1.8.0", true)).toBe(false);
  });

  it("stays off after a rollback to an older build", () => {
    expect(shouldShowWhatsNewDot("1.9.0", "1.8.0", true)).toBe(false);
  });

  it("with nothing recorded, lights for a returning reader only", () => {
    expect(shouldShowWhatsNewDot(null, "1.8.0", true)).toBe(true);
    expect(shouldShowWhatsNewDot(null, "1.8.0", false)).toBe(false);
  });

  it("treats a garbled stored value as older than anything shipped", () => {
    expect(shouldShowWhatsNewDot("not a version", "1.8.0", false)).toBe(true);
  });
});

describe("readWhatsNewState", () => {
  it("a first visit shows nothing and asks for the version to be recorded", () => {
    expect(readWhatsNewState(storageWith({}), "1.8.0")).toEqual({ dot: false, firstVisit: true });
  });

  it("theme and language alone do not make a returning reader", () => {
    const storage = storageWith({ [LOCAL_STORAGE_KEYS.theme]: "dark", [LOCAL_STORAGE_KEYS.lang]: "en" });
    expect(readWhatsNewState(storage, "1.8.0")).toEqual({ dot: false, firstVisit: true });
  });

  it("a reader from before the feature, with a spot saved, gets the dot once", () => {
    const storage = storageWith({ [LOCAL_STORAGE_KEYS.lastSpot]: "{}" });
    expect(readWhatsNewState(storage, "1.8.0")).toEqual({ dot: true, firstVisit: false });
  });

  it("follows the recorded version from then on", () => {
    expect(readWhatsNewState(storageWith({ [SEEN]: "1.8.0" }), "1.8.0")).toEqual({ dot: false, firstVisit: false });
    expect(readWhatsNewState(storageWith({ [SEEN]: "1.8.0" }), "1.9.0")).toEqual({ dot: true, firstVisit: false });
  });

  it("shows nothing when storage is missing or throws", () => {
    expect(readWhatsNewState(null, "1.8.0")).toEqual({ dot: false, firstVisit: false });
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readWhatsNewState(throwing, "1.8.0")).toEqual({ dot: false, firstVisit: false });
  });
});
