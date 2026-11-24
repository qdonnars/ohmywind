// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Serve a local build to a phone on the same network, with a local API
 * behind it: one port, one origin.
 *
 *   VITE_API_BASE= npm run build         # empty base: the app calls its own origin
 *   node scripts/serve-lan.mjs           # dist/ on :4183, /api/ to 127.0.0.1:7860
 *   node scripts/serve-lan.mjs 4183 http://127.0.0.1:7860
 *
 * `/api/` goes to the API, everything else is a file of `dist/` or the
 * app's `index.html`. Each API call is logged with its size, which is the
 * point: what a phone exchanges with the server while it plans a route.
 * Plain HTTP, so no service worker on the phone: every load is a fresh one.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4183);
const api = new URL(process.argv[3] ?? "http://127.0.0.1:7860");
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function proxy(req, res) {
  const started = Date.now();
  let sent = 0;
  const upstream = httpRequest(
    { host: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } },
    (up) => {
      let received = 0;
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.on("data", (chunk) => {
        received += chunk.length;
        res.write(chunk);
      });
      up.on("end", () => {
        res.end();
        console.log(
          `${req.method} ${req.url.slice(0, 70)} ${up.statusCode} sent ${sent} B, received ${received} B, ${Date.now() - started} ms`,
        );
      });
    },
  );
  upstream.on("error", (error) => {
    res.writeHead(502).end(String(error));
    console.log(`${req.method} ${req.url} 502 ${error.message}`);
  });
  req.on("data", (chunk) => {
    sent += chunk.length;
    upstream.write(chunk);
  });
  req.on("end", () => upstream.end());
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) return proxy(req, res);
  let file = normalize(join(dist, path));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(dist, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(port, "0.0.0.0", () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => `http://${a.address}:${port}/plan?repair-stats=1`);
  console.log(`serving ${dist} and ${api.origin}/api/ on:\n  ${addresses.join("\n  ")}`);
});
