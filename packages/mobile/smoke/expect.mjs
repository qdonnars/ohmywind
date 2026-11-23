// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Waits for a probe report that matches every expectation, or fails.
//
//   node expect.mjs <reports.jsonl> <since ms> <timeout s> <out.json> key=value...
//
// Only reports received at or after <since> count. A key is a dotted path in
// the report (sw.controlled); a value is JSON when it parses (true, 3, "x"),
// a plain string otherwise. A value starting with ~ is a substring match.
// The matching report is written to <out.json>. `none` as the only
// expectation inverts the test: success when no report arrives in time.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [file, sinceArg, timeoutArg, outFile, ...pairs] = process.argv.slice(2);
if (!file || !sinceArg || !timeoutArg || !outFile || pairs.length === 0) {
  console.error("usage: node expect.mjs <reports.jsonl> <since ms> <timeout s> <out.json> key=value...");
  process.exit(2);
}
const since = Number(sinceArg);
const deadline = Date.now() + Number(timeoutArg) * 1000;
const expectNone = pairs.length === 1 && pairs[0] === "none";

const expectations = expectNone
  ? []
  : pairs.map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 1) throw new Error(`not a key=value pair: ${pair}`);
      const path = pair.slice(0, eq);
      const raw = pair.slice(eq + 1);
      if (raw.startsWith("~")) return { path, contains: raw.slice(1) };
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      return { path, value };
    });

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function matches(report) {
  return expectations.every(({ path, value, contains }) => {
    const actual = get(report, path);
    if (contains !== undefined) return typeof actual === "string" && actual.includes(contains);
    return JSON.stringify(actual) === JSON.stringify(value);
  });
}

function reports() {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => r.receivedAt >= since);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (;;) {
  const current = reports();
  if (expectNone) {
    if (current.length > 0) {
      console.error(`[expect] FAIL: expected no report, got ${current.length}`);
      console.error(JSON.stringify(current.at(-1), null, 2));
      process.exit(1);
    }
    if (Date.now() > deadline) {
      writeFileSync(outFile, JSON.stringify({ reports: 0 }, null, 2) + "\n");
      console.log("[expect] OK: no report, as expected");
      process.exit(0);
    }
  } else {
    const hit = current.find(matches);
    if (hit) {
      writeFileSync(outFile, JSON.stringify(hit, null, 2) + "\n");
      console.log(`[expect] OK: ${pairs.join(" ")}`);
      console.log(JSON.stringify(hit, null, 2));
      process.exit(0);
    }
    if (Date.now() > deadline) {
      console.error(`[expect] FAIL after ${timeoutArg} s: ${pairs.join(" ")}`);
      console.error(`[expect] ${current.length} report(s) since ${since}; the last one:`);
      console.error(JSON.stringify(current.at(-1) ?? null, null, 2));
      process.exit(1);
    }
  }
  await sleep(1000);
}
