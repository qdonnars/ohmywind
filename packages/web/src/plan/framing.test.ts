// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { framesOnResults } from "./framing";

const repair = () => ({ original: [[48.38, -4.49], [48.64, -2.03]], changes: [] });

describe("framesOnResults", () => {
  it("frames what the reader asked to compute", () => {
    expect(framesOnResults(true, null, null)).toBe(true);
  });

  it("leaves the camera alone on results nobody asked for", () => {
    expect(framesOnResults(false, null, null)).toBe(false);
  });

  it("frames a route the results retraced, a link opened included", () => {
    expect(framesOnResults(false, repair(), null)).toBe(true);
  });

  it("frames a second repair of a route already repaired once", () => {
    expect(framesOnResults(false, repair(), repair())).toBe(true);
  });

  it("does not frame again on results that left the repair as it was", () => {
    const known = repair();
    expect(framesOnResults(false, known, known)).toBe(false);
  });

  it("does not frame when the reader went back to the route as drawn", () => {
    expect(framesOnResults(false, null, repair())).toBe(false);
  });
});
