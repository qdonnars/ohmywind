// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Prints the next build number (CFBundleVersion) of an app on App Store
// Connect: the highest build already uploaded with its last number raised by
// one, so builds read 6.1, 6.2, 6.3 rather than jumping with the workflow run
// counter. A build number made of one integer only (6) gets a second one
// (6.1). Apple compares each number as an integer: 6.10 comes after 6.9.
//
//   node asc-next-build.mjs <bundle-id> [--first 1.1]
//
// --first is printed when the app has no build yet. Reads the API key from
// ASC_KEY_PATH (the .p8 file), ASC_KEY_ID and ASC_ISSUER_ID. Read-only,
// prints no secret.
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const args = process.argv.slice(2);
const bundleId = args[0];
const firstIndex = args.indexOf("--first");
const first = firstIndex >= 0 ? args[firstIndex + 1] : "1.1";
if (!bundleId) throw new Error("usage: asc-next-build.mjs <bundle-id> [--first 1.1]");
const { ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID } = process.env;
if (!ASC_KEY_PATH || !ASC_KEY_ID || !ASC_ISSUER_ID) throw new Error("set ASC_KEY_PATH, ASC_KEY_ID and ASC_ISSUER_ID");

const b64url = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }))}.${b64url(JSON.stringify({
  iss: ASC_ISSUER_ID,
  iat: now,
  exp: now + 600,
  aud: "appstoreconnect-v1",
}))}`;
const sig = createSign("SHA256").update(unsigned).sign({ key: readFileSync(ASC_KEY_PATH, "utf8"), dsaEncoding: "ieee-p1363" });
const token = `${unsigned}.${b64url(sig)}`;

const get = async (path) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`GET ${path.split("?")[0]}: HTTP ${res.status} ${body?.errors?.[0]?.detail ?? ""}`);
  return body;
};

// The filter also matches longer identifiers (fr.ohmywind.app.dev for
// fr.ohmywind.app): keep the exact one.
const apps = await get(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`);
const app = apps.data.find((a) => a.attributes.bundleId === bundleId);
if (!app) throw new Error(`no app ${bundleId} on App Store Connect`);

// Builds are uploaded with increasing numbers: the latest 200 hold the highest.
const builds = await get(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=200&fields[builds]=version`);
console.log(nextBuild(builds.data.map((b) => b.attributes.version), first));

export function nextBuild(versions, first) {
  const parsed = versions
    .map((v) => String(v).split(".").map((n) => Number.parseInt(n, 10)))
    .filter((parts) => parts.length > 0 && parts.every(Number.isFinite));
  if (!parsed.length) return first;
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d) return d;
    }
    return 0;
  };
  const highest = parsed.reduce((m, p) => (cmp(p, m) > 0 ? p : m));
  const next = highest.length === 1 ? [highest[0], 1] : [...highest.slice(0, -1), highest.at(-1) + 1];
  return next.join(".");
}
