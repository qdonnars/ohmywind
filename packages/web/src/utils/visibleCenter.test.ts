// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { centerForBottomInset, mercatorY } from "./visibleCenter";

describe("centerForBottomInset", () => {
  it("returns the point itself when there is no inset", () => {
    const c = centerForBottomInset(43.3, 5.35, 10, 0);
    expect(c).toEqual({ lat: 43.3, lon: 5.35 });
  });

  it("never moves the longitude", () => {
    const c = centerForBottomInset(48.38, -4.49, 12, 380);
    expect(c.lon).toBe(-4.49);
  });

  it("moves the centre south of the point (positive inset)", () => {
    const c = centerForBottomInset(43.3, 5.35, 10, 400);
    expect(c.lat).toBeLessThan(43.3);
  });

  it("puts the centre exactly insetPx/2 screen pixels below the point", () => {
    // The pixel-space contract: a panel covering the bottom `inset` pixels
    // leaves a visible strip whose middle is inset/2 above the container
    // centre — so the centre must project inset/2 below the point.
    for (const [lat, zoom, inset] of [
      [43.3, 10, 400],
      [48.38, 6, 250],
      [-35.0, 13, 371],
    ]) {
      const c = centerForBottomInset(lat, 5.35, zoom, inset);
      const dy = mercatorY(c.lat, zoom) - mercatorY(lat, zoom);
      expect(dy).toBeCloseTo(inset / 2, 6);
    }
  });

  it("round-trips: shifting back by a negative inset restores the point", () => {
    const down = centerForBottomInset(43.3, 5.35, 10, 400);
    const back = centerForBottomInset(down.lat, down.lon, 10, -400);
    expect(back.lat).toBeCloseTo(43.3, 9);
  });
});
