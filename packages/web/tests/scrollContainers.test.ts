// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Every scroll container is positioned.
 *
 * An absolutely positioned element is placed against its nearest positioned
 * ancestor, and only a scroll container that is (or contains) that ancestor
 * clips it. A `sr-only` text in a static table cell, inside a drawer that
 * was not positioned, was placed against the root, below the fold: the page
 * of the plan scrolled by up to 149 px in landscape and its header went
 * under the status bar (QA of 2026-11-24). jsdom has no layout, so the rule
 * is checked in the source: every class list that makes an element scroll
 * also positions it. The geometry itself is measured on a device by the
 * `layout` probe of `packages/mobile/smoke`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** Class lists that scroll, as `file: classes`, that lack a position. */
function unpositionedScrollers(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    // A class list is a string or template literal on one line.
    for (const m of source.matchAll(/className=\{?(["`])([^"`\n]*)\1/g)) {
      const classes = m[2].split(/\s+/);
      const scrolls = classes.some((c) => /^overflow(-[xy])?-(auto|scroll)$/.test(c));
      const positioned = classes.some((c) => /^(relative|absolute|fixed|sticky)$/.test(c));
      if (scrolls && !positioned) found.push(`${relative(SRC, file)}: ${m[2]}`);
    }
  }
  return found;
}

describe("scroll containers", () => {
  it("finds the scroll containers it checks", () => {
    // Guards the scan itself: a regex that matched nothing would pass.
    const source = readFileSync(join(SRC, "routes/PlanPage.tsx"), "utf8");
    expect(source).toMatch(/className="[^"]*\boverflow-y-auto\b/);
  });

  it("are all positioned, so nothing absolutely positioned escapes them", () => {
    expect(unpositionedScrollers()).toEqual([]);
  });

  it("does not let a style-only scroller slip past the scan", () => {
    // `overflow: "auto"` in a style object would not be seen above.
    const offenders = sourceFiles(SRC).filter((file) =>
      /overflow[XY]?:\s*["'](auto|scroll)["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});
