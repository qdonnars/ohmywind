// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import {
  statusFromErrorCode,
  statusAfterFailure,
  geolocMessage,
} from "./useGeolocation";

describe("statusFromErrorCode", () => {
  it("maps PERMISSION_DENIED to denied", () => {
    expect(statusFromErrorCode(1)).toBe("denied");
  });

  it("maps TIMEOUT to timeout", () => {
    expect(statusFromErrorCode(3)).toBe("timeout");
  });

  it("maps POSITION_UNAVAILABLE to unavailable", () => {
    expect(statusFromErrorCode(2)).toBe("unavailable");
  });

  it("falls back to unavailable for codes outside the spec", () => {
    // Some WebViews report codes the spec does not define; a wrong-but-safe
    // "unavailable" beats crashing on an unmapped value.
    expect(statusFromErrorCode(0)).toBe("unavailable");
    expect(statusFromErrorCode(42)).toBe("unavailable");
  });
});

describe("statusAfterFailure", () => {
  it("swallows every failure of a silent request back to idle", () => {
    // The app asked on its own (first-visit auto-locate); the user asked for
    // nothing and must not be shown an error. Seed: the Android TWA's first
    // launch fails with a technical "denied" before Chrome registers the
    // app for permission delegation (no user ever saw a prompt).
    for (const code of [1, 2, 3, 0]) {
      expect(statusAfterFailure(code, true)).toBe("idle");
    }
  });

  it("reports failures of an explicit request untouched", () => {
    expect(statusAfterFailure(1, false)).toBe("denied");
    expect(statusAfterFailure(2, false)).toBe("unavailable");
    expect(statusAfterFailure(3, false)).toBe("timeout");
  });
});

describe("geolocMessage", () => {
  it("stays silent while nothing has gone wrong", () => {
    expect(geolocMessage("idle")).toBeNull();
    expect(geolocMessage("locating")).toBeNull();
    expect(geolocMessage("ready")).toBeNull();
  });

  it("explains every failure state", () => {
    for (const status of ["denied", "unavailable", "timeout"] as const) {
      expect(geolocMessage(status)).toBeTruthy();
    }
  });

  it("keeps user-facing copy free of em-dashes", () => {
    for (const status of ["denied", "unavailable", "timeout"] as const) {
      expect(geolocMessage(status)).not.toContain("—");
    }
  });
});
