// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// No renderer here: jsdom and Testing Library are not on this branch yet, they
// arrive with the component test infrastructure. These cover the boundary's
// pure parts, which are the ones carrying the reasoning: the error
// discriminator and the payload cache. The rendered output and the offline
// behaviour are checked on the production build.

import { describe, it, expect } from "vitest";
import { LazyPageBoundary } from "./LazyPageBoundary";
import { isModuleLoadError, lazyFor, type PageLoader } from "./lazyPage";

describe("isModuleLoadError", () => {
  it("recognises how each engine words a failed dynamic import", () => {
    expect(
      isModuleLoadError(
        new TypeError("Failed to fetch dynamically imported module: https://x/a.js"),
      ),
    ).toBe(true);
    expect(isModuleLoadError(new TypeError("error loading dynamically imported module"))).toBe(
      true,
    );
    expect(isModuleLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    const named = new Error("boom");
    named.name = "ChunkLoadError";
    expect(isModuleLoadError(named)).toBe(true);
  });

  it("recognises Vite's own preload wording, which is what the build throws", () => {
    // Observed offline on the production build: the helper fails on the
    // chunk's stylesheet before the engine gets to the module, so this is the
    // error the boundary actually receives first.
    expect(
      isModuleLoadError(new Error("Unable to preload CSS for /assets/MethodologiePage-a1.css")),
    ).toBe(true);
  });

  it("does not blame the network for an error thrown by the page itself", () => {
    expect(isModuleLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isModuleLoadError(new Error("Invalid hook call"))).toBe(false);
    expect(isModuleLoadError(null)).toBe(false);
    expect(isModuleLoadError(undefined)).toBe(false);
    expect(isModuleLoadError("something else")).toBe(false);
  });

  it("reads a bare string too, since anything can be thrown", () => {
    expect(isModuleLoadError("Failed to fetch dynamically imported module")).toBe(true);
  });
});

describe("lazyFor", () => {
  it("hands back the same payload for a loader, so a remount does not reload", () => {
    const load: PageLoader = () => Promise.resolve({ default: () => null });
    expect(lazyFor(load)).toBe(lazyFor(load));
  });

  it("keeps one payload per loader", () => {
    const a: PageLoader = () => Promise.resolve({ default: () => null });
    const b: PageLoader = () => Promise.resolve({ default: () => null });
    expect(lazyFor(a)).not.toBe(lazyFor(b));
  });
});

describe("LazyPageBoundary", () => {
  it("moves to the error state on a thrown error, whatever its shape", () => {
    const err = new TypeError("Failed to fetch dynamically imported module");
    expect(LazyPageBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
    expect(LazyPageBoundary.getDerivedStateFromError("plain string")).toEqual({
      error: "plain string",
    });
  });

  it("starts clear of any error", () => {
    const load: PageLoader = () => Promise.resolve({ default: () => null });
    expect(new LazyPageBoundary({ load, fallback: null }).state).toEqual({ error: null });
  });
});
