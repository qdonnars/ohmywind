import { describe, it, expect } from "vitest";
import { statusFromErrorCode, geolocMessage } from "./useGeolocation";

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
