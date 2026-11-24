// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Inline probe.js into a built index.html, for the mobile smoke test only.
//
//   node inject-probe.mjs <path/to/dist/index.html> <collector URL>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [indexPath, collectorUrl] = process.argv.slice(2);
if (!indexPath || !collectorUrl) {
  console.error("usage: node inject-probe.mjs <dist/index.html> <collector URL>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const probe = readFileSync(join(here, "probe.js"), "utf8").replace(
  "__OHMYWIND_PROBE_COLLECTOR__",
  collectorUrl,
);
const html = readFileSync(indexPath, "utf8");
if (html.includes("__ohmywind_probe__")) {
  console.log(`[inject-probe] ${indexPath} already carries the probe`);
  process.exit(0);
}
if (!html.includes("</head>")) throw new Error(`${indexPath} has no </head>`);
const tag = `<script id="__ohmywind_probe__">\n${probe}\n</script>\n`;
writeFileSync(indexPath, html.replace("</head>", `${tag}</head>`));
console.log(`[inject-probe] probe inlined into ${indexPath}, reporting to ${collectorUrl}`);
