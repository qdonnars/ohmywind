// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The passage engine's warnings reach the app as codes (issue #411), and the
 * app says them from its `plan.notice.<code>` entries. Two lists, two
 * packages, nothing else keeping them in step: a warning added on the server
 * without its entry here would show up in French in every language, and a
 * French entry drifting from the server's own sentence would show a French
 * reader two wordings of one warning depending on the build they hold.
 *
 * So: every template in `routing/notices.py` has its entry in the French
 * dictionary, word for word, and the dictionary has no entry without a
 * template. The other languages are checked against French by dicts.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fr } from "../src/i18n/fr";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SERVER_FILE = join(HERE, "../../data-adapters/src/openwind_data/routing/notices.py");

/** The `FR_TEMPLATES` dict of notices.py as {code: sentence}. A key is the
    string literal a colon follows; the literals after it, up to the next
    key, are the fragments of its sentence (Python joins adjacent literals). */
function serverTemplates(): Record<string, string> {
  const source = readFileSync(SERVER_FILE, "utf8");
  const start = source.indexOf("FR_TEMPLATES: dict[str, str] = {");
  const end = source.indexOf("\n}\n", start);
  const block = source.slice(start, end);
  const out: Record<string, string> = {};
  let key = "";
  for (const m of block.matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?/g)) {
    const literal = m[1].replace(/\\(.)/g, "$1");
    if (m[2]) {
      key = literal;
      out[key] = "";
    } else {
      out[key] += literal;
    }
  }
  return out;
}

describe("the notice entries mirror the server's templates", () => {
  const templates = serverTemplates();
  const entries = Object.fromEntries(
    Object.entries(fr)
      .filter(([k]) => k.startsWith("plan.notice."))
      .map(([k, v]) => [k.slice("plan.notice.".length), v]),
  );

  it("reads the server's templates", () => {
    expect(Object.keys(templates).length).toBeGreaterThan(10);
  });

  it("has one entry per server code, and none the server does not send", () => {
    expect(Object.keys(entries).sort()).toEqual(Object.keys(templates).sort());
  });

  it.each(Object.keys(templates))("says %s in the server's own words", (code) => {
    expect(entries[code]).toBe(templates[code]);
  });
});
