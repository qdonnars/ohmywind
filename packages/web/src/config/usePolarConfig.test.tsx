// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePolarConfig, resetPolarConfigSnapshot } from "./usePolarConfig";
import {
  defaultPolarConfig,
  savePolarConfig,
  POLAR_CONFIG_KEY,
  type PolarConfig,
} from "./polarConfig";

beforeEach(() => {
  localStorage.clear();
  resetPolarConfigSnapshot();
});

describe("usePolarConfig", () => {
  it("reads the stored configuration", () => {
    savePolarConfig({ ...defaultPolarConfig(), base: "catamaran_40ft" });
    const { result } = renderHook(() => usePolarConfig());
    expect(result.current.base).toBe("catamaran_40ft");
  });

  it("falls back to the defaults when nothing is stored", () => {
    const { result } = renderHook(() => usePolarConfig());
    expect(result.current.base).toBe(defaultPolarConfig().base);
  });

  it("hands back the same object while nothing writes", () => {
    const seen: PolarConfig[] = [];
    const { rerender, result } = renderHook(() => {
      const cfg = usePolarConfig();
      seen.push(cfg);
      return cfg;
    });
    rerender();
    rerender();
    // Identity, not just equality: a fresh object on every render would make
    // every `useMemo` keyed on it useless, which is the whole point.
    expect(seen.every((c) => c === result.current)).toBe(true);
  });

  it("re-renders on a write from this very tab", () => {
    const { result } = renderHook(() => usePolarConfig());
    expect(result.current.base).toBe("cruiser_30ft");

    act(() => {
      savePolarConfig({ ...defaultPolarConfig(), base: "racer_cruiser" });
    });
    // The browser fires `storage` for other tabs only: without the module
    // registry, the boat picked on /plan would never reach the recap strip.
    expect(result.current.base).toBe("racer_cruiser");
  });

  it("re-renders on a write from another tab", () => {
    const { result } = renderHook(() => usePolarConfig());
    act(() => {
      localStorage.setItem(
        POLAR_CONFIG_KEY,
        JSON.stringify({ v: 3, base: "catamaran_40ft", coefficient: 0.9, spi: "off", spiMaxTwsKn: 16, overrides: {}, source: "archetype", imported: null, persoActive: true }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key: POLAR_CONFIG_KEY }));
    });
    expect(result.current.base).toBe("catamaran_40ft");
    expect(result.current.coefficient).toBe(0.9);
  });

  it("drops its listeners when the last reader unmounts", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => usePolarConfig());
    expect(add.mock.calls.some(([type]) => type === "storage")).toBe(true);
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "storage")).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});
