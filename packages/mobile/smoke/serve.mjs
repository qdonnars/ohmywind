// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Static server for the web build during the mobile smoke test, standing in
// for `vite preview` (which needs the web package's native dependencies, and
// the root lockfile only carries the Linux ones). Same behaviour where it
// matters: files from dist/, index.html for any other path (the app routes
// on the client), the right content types for the service worker.
//
//   node serve.mjs <dist dir> <port>

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pbf": "application/x-protobuf",
};

function fileFor(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(root, safe);
  if (!candidate.startsWith(root)) return null;
  try {
    const st = statSync(candidate);
    if (st.isFile()) return candidate;
    if (st.isDirectory()) {
      const index = join(candidate, "index.html");
      if (statSync(index).isFile()) return index;
    }
  } catch {
    /* not found */
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  // Like vite preview: a path without a file extension is a page of the app.
  const file = fileFor(pathname) ?? (extname(pathname) === "" ? join(root, "index.html") : null);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`[serve] ${root} on http://localhost:${port}`));
