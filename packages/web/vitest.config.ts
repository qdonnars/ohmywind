// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Test-only configuration, kept out of `vite.config.ts` on purpose.
 *
 * Vitest picks `vitest.config.ts` over `vite.config.ts` when both exist, and
 * we merge the build config in so the resolver, the plugins and the aliases
 * stay bit for bit those of the app. Nothing here reaches a production build.
 *
 * Two projects rather than a single environment:
 *
 * - `unit` runs every `*.test.ts` in Node, as they always have. They are pure
 *   modules (parsers, geometry, formatting) and never touch a DOM, so paying
 *   for a jsdom instance per file would slow the suite down for nothing.
 *   `tests/` is part of that project: it holds the checks that read the repo
 *   from disk (`node:fs`), which `src/` is deliberately not typed for.
 * - `dom` runs every `*.test.tsx` in jsdom, for component tests.
 *
 * Vitest 4 dropped `environmentMatchGlobs`, and the per-file
 * `// @vitest-environment jsdom` pragma relies on every author remembering it.
 * Projects put the rule in the config, where it cannot be forgotten.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "node",
            include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "dom",
            environment: "jsdom",
            include: ["src/**/*.test.tsx"],
            setupFiles: ["./src/test/setupDom.ts"],
          },
        },
      ],
    },
  }),
);
