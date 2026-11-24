// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Markdown table of what the probe saw at each stage of run.sh, for the job
// summary.
//
//   node summary.mjs <out dir> <title>

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, title = "Mobile smoke"] = process.argv.slice(2);
const stages = ["0-fallback", "1-first", "2-second", "3-offline", "4-plan"];

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
  // 4-plan: the page geometry, the point of the stage.
  const l = r.layout;
  const result =
    stage === "4-plan" && l
      ? `ok, header ${Math.round(l.header?.top ?? NaN)}..${Math.round(l.header?.bottom ?? NaN)} px, column ${l.column?.clientHeight}/${l.column?.scrollHeight}, viewport ${l.innerHeight}`
      : "ok";
  lines.push(
    `| ${stage} | ${result} | ${r.native} | ${r.platform} | ${app} | ${sw} | ${i.top}/${i.right}/${i.bottom}/${i.left} | ${(r.errors ?? []).length} |`,
  );
}
lines.push("");
console.log(lines.join("\n"));
