// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Markdown table of what the probe saw at each stage of run.sh, for the job
// summary.
//
//   node summary.mjs <out dir> <title>

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, title = "Mobile smoke"] = process.argv.slice(2);
const stages = ["0-fallback", "1-first", "2-second", "3-offline"];

const lines = [`### ${title}`, ""];
lines.push("| Stage | Result | Native | Platform | App | Service worker | Safe area (t/r/b/l) | Errors |");
lines.push("|---|---|---|---|---|---|---|---|");
for (const stage of stages) {
  const file = join(dir, `${stage}.json`);
  if (!existsSync(file)) {
    lines.push(`| ${stage} | not reached or failed |  |  |  |  |  |  |`);
    continue;
  }
  const r = JSON.parse(readFileSync(file, "utf8"));
  if (stage === "0-fallback") {
    lines.push(`| ${stage} | fallback page, ${r.reports ?? "?"} probe report |  |  |  |  |  |  |`);
    continue;
  }
  const app = r.appInfo ? `${r.appInfo.id ?? "?"} ${r.appInfo.version ?? ""} (${r.appInfo.build ?? ""})` : "none";
  const sw = r.sw
    ? `${r.sw.registered ? "registered" : "not registered"}, ${r.sw.active ?? "no active worker"}, ${r.sw.controlled ? "controls the page" : "not controlling"}`
    : "?";
  const i = r.insets ?? {};
  lines.push(
    `| ${stage} | ok | ${r.native} | ${r.platform} | ${app} | ${sw} | ${i.top}/${i.right}/${i.bottom}/${i.left} | ${(r.errors ?? []).length} |`,
  );
}
lines.push("");
console.log(lines.join("\n"));
