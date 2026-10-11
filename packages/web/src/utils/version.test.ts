// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { APP_VERSION, compareVersions } from "./version";

describe("APP_VERSION", () => {
  it("is the x.y.z version of package.json, injected at build time", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("compareVersions", () => {
  it("orders by major, then minor, then patch, numerically", () => {
    expect(compareVersions("1.8.0", "1.8.0")).toBe(0);
    expect(compareVersions("1.9.0", "1.8.0")).toBeGreaterThan(0);
    expect(compareVersions("1.8.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.3.3", "1.3.10")).toBeLessThan(0);
  });

  it("puts a malformed version below every valid one", () => {
    expect(compareVersions("1.0.0", "garbage")).toBeGreaterThan(0);
    expect(compareVersions("v1.0.0", "0.0.1")).toBeLessThan(0);
    expect(compareVersions("", "")).toBe(0);
  });
});
