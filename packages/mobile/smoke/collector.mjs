// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Receives the probe's reports during the mobile smoke test and appends each
// one, stamped with the time it arrived, to a JSON Lines file.
//
//   node collector.mjs <port> <reports.jsonl>

import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4174);
const out = process.argv[3] ?? "reports.jsonl";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, cors).end();
    return;
  }
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    let report;
    try {
      report = JSON.parse(body);
    } catch {
      report = { unparsable: body.slice(0, 500) };
    }
    const line = JSON.stringify({ receivedAt: Date.now(), ...report });
    appendFileSync(out, line + "\n");
    console.log(`[collector] ${line.slice(0, 300)}`);
    res.writeHead(204, cors).end();
  });
}).listen(port, () => console.log(`[collector] listening on ${port}, writing ${out}`));
