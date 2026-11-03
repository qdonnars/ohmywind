// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The legal pages a crawler without JavaScript reads (plugins/legalPages.ts).
 *
 * The build runs here, into a temporary directory, rather than reading dist/:
 * CI runs the tests before `npm run build`, and a stale dist/ would prove
 * nothing. It takes a few seconds.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LEGAL_PAGES, STATIC_LANG, buildLegalHtml, renderMarkdown } from "../plugins/legalPages";

const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("renderMarkdown", () => {
  it("renders GitHub-flavoured markdown, as the page component does", () => {
    const html = renderMarkdown("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ and [a link](/conditions)");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('<a href="/conditions">a link</a>');
  });
});

describe("buildLegalHtml", () => {
  const page = LEGAL_PAGES[0];

  it("fails loudly when index.html no longer has the shape it patches", () => {
    expect(() => buildLegalHtml("<html><body></body></html>", page, "<p>x</p>")).toThrow(/legal pages/);
  });
});

describe("the built legal pages", () => {
  let out: string;
  let indexHtml: string;

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "ohmywind-legal-"));
    await build({
      root: WEB,
      configFile: join(WEB, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir: out, emptyOutDir: true },
    });
    indexHtml = readFileSync(join(out, "index.html"), "utf8");
  }, 120_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it.each(LEGAL_PAGES.map((p) => [p.file, p] as const))("%s carries its text and boots the app", (file, page) => {
    const path = join(out, file);
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, "utf8");

    // A heading and a plain sentence of the markdown the page renders.
    const markdown = readFileSync(join(WEB, page.source), "utf8");
    const heading = markdown.match(/^# (.+)$/m)![1];
    const sentence = markdown
      .split("\n")
      .find((l) => /^[A-Z][^*_[\]()`&'"<>|#]{40,}$/.test(l.trim()))!
      .trim();
    expect(html).toContain(`<h1>${heading}</h1>`);
    expect(html).toContain(sentence);
    expect(html).toContain("Libramer");

    // Same entry script as index.html: the SPA boots and takes over.
    const entry = indexHtml.match(/<script type="module"[^>]*src="([^"]+)"/)![1];
    expect(html).toContain(`src="${entry}"`);

    // Every slot of the template filled, none left as it was.
    expect(html).not.toContain('<div id="root"></div>');
    expect(html).toContain(`<html lang="${STATIC_LANG}">`);
    expect(html).toContain(`<title>${page.title}</title>`);
    expect(html).not.toContain("<title>OhMyWind</title>");
    // The page's own description and share tags, none of the site's left.
    const siteDescription = indexHtml.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(html).toContain(`<meta name="description" content="${page.description}">`);
    expect(html).toContain(`<meta property="og:title" content="${page.title}">`);
    expect(html).not.toContain(siteDescription);
    expect(html).toContain(`<link rel="canonical" href="https://ohmywind.fr${page.canonicalPath}">`);
  });

  it("keeps them out of the service worker's precache, index.html in", () => {
    const sw = readFileSync(join(out, "sw.js"), "utf8");
    for (const page of LEGAL_PAGES) expect(sw).not.toContain(page.file);
    // Minified or not (vitest builds in test mode), the shell stays precached:
    // navigateFallback serves it for every navigation of an installed app.
    expect(sw).toMatch(/"?url"?\s*:\s*"index\.html"/);
  });
});
