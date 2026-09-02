// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The seven archetype polars under `src/data/polars/` are copies of the files
 * the server plans with, in `packages/data-adapters`. The client needs its own
 * copy: the polar editor draws a diagram and computes an override before any
 * request is sent, and `/config` has to work offline.
 *
 * Nothing kept the two in step. A tweak to an archetype on the server would
 * have left the web app drawing one boat and the server sailing another, with
 * no error anywhere and an ETA quietly off. This test is that missing link:
 * byte for byte, not value for value, so a reformat is caught too and the two
 * files stay literally copyable.
 *
 * If it fails, copy the server file over the client one:
 *   cp packages/data-adapters/src/openwind_data/routing/polars/<name>.json \
 *      packages/web/src/data/polars/<name>.json
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(HERE, "../src/data/polars");
const SERVER_DIR = join(
  HERE,
  "../../data-adapters/src/openwind_data/routing/polars",
);

const jsonFilesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .sort();

const clientFiles = jsonFilesIn(CLIENT_DIR);
const serverFiles = jsonFilesIn(SERVER_DIR);

describe("bundled polars mirror the server ones", () => {
  it("ships every archetype the server has, and no other", () => {
    expect(clientFiles).toEqual(serverFiles);
  });

  it.each(clientFiles)("%s is byte for byte the server file", (name: string) => {
    const client = readFileSync(join(CLIENT_DIR, name));
    const server = readFileSync(join(SERVER_DIR, name));
    // Compare the decoded text first: a diff on bytes prints unreadably.
    expect(client.toString("utf8")).toBe(server.toString("utf8"));
    expect(client.equals(server)).toBe(true);
  });
});
