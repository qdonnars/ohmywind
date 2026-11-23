// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { isNativeShell } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNativeShell", () => {
  it("is false in a plain browser", () => {
    vi.stubGlobal("window", {});
    expect(isNativeShell()).toBe(false);
  });

  it("is false when Capacitor's web runtime says web", () => {
    vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => false } });
    expect(isNativeShell()).toBe(false);
  });

  it("is true inside the shell", () => {
    vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true } });
    expect(isNativeShell()).toBe(true);
  });

  it("is false when the global is not what it claims", () => {
    vi.stubGlobal("window", { Capacitor: { isNativePlatform: "yes" } });
    expect(isNativeShell()).toBe(false);
  });
});
