// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Every page opens offline (issue #537).
 *
 * The pages `Routes.tsx` loads on demand each have a chunk of their own; the
 * service worker only serves offline what it precached. This test builds the
 * app (into a temporary directory: CI runs the tests before the build, and a
 * stale dist/ would prove nothing), then checks that each page's chunk, its
 * stylesheet and the files it pulls in are in the worker's precache list. A
 * new lazy route, or a glob added to `plugins/precache.ts` that catches one,
 * fails here rather than on a boat.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));

/** The page modules `Routes.tsx` imports dynamically, by file name. */
function lazyPageModules(): string[] {
  const source = readFileSync(join(WEB, "src/Routes.tsx"), "utf8");
  const names = [...source.matchAll(/import\(\s*["']\.\/routes\/(\w+)["']\s*\)/g)].map((m) => m[1]);
  return [...new Set(names)];
}

/** Files a built chunk imports, statically or dynamically, as `assets/…`. */
function importsOf(code: string): string[] {
  return [...code.matchAll(/["'(]\.?\/?(?:assets\/)?([\w.-]+\.(?:js|css|svg|woff2))["')]/g)].map((m) => `assets/${m[1]}`);
}

describe("offline coverage of the lazy routes", () => {
  let out: string;
  let precached: Set<string>;
  let assets: string[];

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "ohmywind-offline-"));
    await build({
      root: WEB,
      configFile: join(WEB, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir: out, emptyOutDir: true },
    });
    const sw = readFileSync(join(out, "sw.js"), "utf8");
    precached = new Set([...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1]));
    assets = readdirSync(join(out, "assets")).map((f) => `assets/${f}`);
  }, 120_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("finds the lazy routes in Routes.tsx", () => {
    // Guards the parser: an empty list would make the next test pass vacuously.
    expect(lazyPageModules()).toEqual(
      expect.arrayContaining(["MethodologiePage", "ConfidentialitePage", "ConditionsPage", "WhatsNewPage", "AboutPage"]),
    );
  });

  it("precaches each lazy page's chunk and everything it loads", () => {
    for (const name of lazyPageModules()) {
      const chunks = assets.filter((f) => f.startsWith(`assets/${name}-`) && f.endsWith(".js"));
      expect(chunks.length, `${name}: no chunk in the build`).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(precached.has(chunk), `${chunk} is not precached`).toBe(true);
        const code = readFileSync(join(out, chunk), "utf8");
        for (const dep of importsOf(code)) {
          if (!assets.includes(dep)) continue;
          expect(precached.has(dep), `${dep}, loaded by ${name}, is not precached`).toBe(true);
        }
      }
    }
  });

  it("precaches the fonts the documentation pages render math with", () => {
    const woff2 = assets.filter((f) => /KaTeX_.*\.woff2$/.test(f));
    expect(woff2.length).toBeGreaterThan(0);
    for (const f of woff2) expect(precached.has(f), f).toBe(true);
  });

  it("serves every navigation from the shell", () => {
    expect(precached.has("index.html")).toBe(true);
  });
});
