// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme";
import { useTheme } from "./useTheme";

/** jsdom has no matchMedia: a device whose setting the test flips. */
function installSystem(light: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches: light,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    flip(toLight: boolean) {
      mql.matches = toLight;
      act(() => {
        for (const l of listeners) l({ matches: toLight });
      });
    },
  };
}

function Probe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <output data-testid="state">{`${preference}/${resolvedTheme}`}</output>
      <button onClick={() => setPreference("auto")}>auto</button>
      <button onClick={() => setPreference("light")}>light</button>
      <button onClick={() => setPreference("dark")}>dark</button>
    </div>
  );
}

const state = () => screen.getByTestId("state").textContent;
const stamped = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("starts on Auto with nothing stored, and follows the device live", () => {
    const system = installSystem(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(state()).toBe("auto/dark");
    expect(stamped()).toBe("dark");

    system.flip(true);
    expect(state()).toBe("auto/light");
    expect(stamped()).toBe("light");

    system.flip(false);
    expect(state()).toBe("auto/dark");
    expect(stamped()).toBe("dark");
  });

  it("holds a fixed choice whatever the device does, then lands on the device's current setting back on Auto", () => {
    const system = installSystem(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => screen.getByText("dark").click());
    expect(localStorage.getItem("ow_theme")).toBe("dark");

    system.flip(true);
    expect(state()).toBe("dark/dark");
    expect(stamped()).toBe("dark");

    act(() => screen.getByText("auto").click());
    expect(state()).toBe("auto/light");
    expect(stamped()).toBe("light");
    expect(localStorage.getItem("ow_theme")).toBeNull();
  });

  it("restores a stored choice", () => {
    installSystem(true);
    localStorage.setItem("ow_theme", "dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(state()).toBe("dark/dark");
  });
});
