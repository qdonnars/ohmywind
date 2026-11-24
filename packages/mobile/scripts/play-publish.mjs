// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Google Play testing tracks through the Android Publisher API, with no
// dependency: a service account signs its own token (RS256 JWT).
//
//   node play-publish.mjs next-version-code <package> [--min N]
//     prints the highest versionCode the app has ever received (bundles and
//     tracks) plus one, never below --min. Opens a draft edit, deletes it.
//
//   node play-publish.mjs upload <package> <aab> <release-name> [--track internal] [--draft]
//     uploads the bundle and releases it on the track, then commits.
//
// The service account comes from PLAY_SERVICE_ACCOUNT_JSON (the key itself)
// or PLAY_SERVICE_ACCOUNT_FILE (a path). Only testing tracks are accepted:
// the production track is refused here, and the account itself has no right
// to publish to production. Prints no secret.
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const TESTING_TRACKS = new Set(["internal", "alpha", "beta"]);

function serviceAccount() {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON
    ?? (process.env.PLAY_SERVICE_ACCOUNT_FILE && readFileSync(process.env.PLAY_SERVICE_ACCOUNT_FILE, "utf8"));
  if (!raw) throw new Error("set PLAY_SERVICE_ACCOUNT_JSON or PLAY_SERVICE_ACCOUNT_FILE");
  return JSON.parse(raw);
}

async function accessToken(sa) {
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri,
    iat: now,
    exp: now + 600,
  }))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`token: HTTP ${res.status} ${body.error ?? ""}`);
  return body.access_token;
}

function client(pkg, token) {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
  const upload = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}`;
  const call = async (step, url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`${step}: HTTP ${res.status} ${body?.error?.message ?? ""}`.trim());
      err.status = res.status;
      throw err;
    }
    return body;
  };
  const deleteEdit = (id) =>
    fetch(`${base}/edits/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  return { base, upload, call, deleteEdit };
}

// Runs fn inside a draft edit; the edit is deleted unless fn commits it.
async function withEdit(api, fn) {
  const edit = await api.call("edits.insert", `${api.base}/edits`, { method: "POST" });
  let committed = false;
  try {
    return await fn(edit.id, () => { committed = true; });
  } finally {
    if (!committed) await api.deleteEdit(edit.id);
  }
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--draft") flags.draft = true;
    else if (a === "--min" || a === "--track") flags[a.slice(2)] = args[++i];
    else rest.push(a);
  }
  return { flags, rest };
}

async function nextVersionCode(api, min) {
  return withEdit(api, async (editId) => {
    const [bundles, tracks] = await Promise.all([
      api.call("bundles.list", `${api.base}/edits/${editId}/bundles`),
      api.call("tracks.list", `${api.base}/edits/${editId}/tracks`),
    ]);
    const codes = [
      ...(bundles?.bundles ?? []).map((b) => Number(b.versionCode)),
      ...(tracks?.tracks ?? []).flatMap((t) => (t.releases ?? []).flatMap((r) => (r.versionCodes ?? []).map(Number))),
    ].filter(Number.isFinite);
    return Math.max(min, codes.length ? Math.max(...codes) + 1 : min);
  });
}

async function uploadBundle(api, aab, name, track, draft) {
  if (!TESTING_TRACKS.has(track)) throw new Error(`refusing track "${track}": testing tracks only`);
  return withEdit(api, async (editId, markCommitted) => {
    const bundle = await api.call("bundles.upload", `${api.upload}/edits/${editId}/bundles?uploadType=media`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: readFileSync(aab),
    });
    console.log(`bundle: versionCode ${bundle.versionCode}, sha256 ${bundle.sha256}`);
    const status = draft ? "draft" : "completed";
    try {
      await api.call("tracks.update", `${api.base}/edits/${editId}/tracks/${track}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track, releases: [{ name, status, versionCodes: [String(bundle.versionCode)] }] }),
      });
      await api.call("edits.commit", `${api.base}/edits/${editId}:commit`, { method: "POST" });
    } catch (e) {
      // An app that has never been released (a "draft app" in the console)
      // only takes draft releases, and committing on it needs a right the
      // account does not have: the first release goes through the console.
      if (/draft app/i.test(e.message) || e.status === 403) {
        e.message += "\nIf the app has never been released, deploy its first release from the Play Console; the API takes over afterwards.";
      }
      throw e;
    }
    markCommitted();
    console.log(`released ${name} on ${track} [${status}]`);
    return bundle.versionCode;
  });
}

const [command, pkg, ...args] = process.argv.slice(2);
const { flags, rest } = parseFlags(args);
if (!pkg) throw new Error("usage: play-publish.mjs next-version-code|upload <package> ...");
const sa = serviceAccount();
const token = await accessToken(sa);
const api = client(pkg, token);

if (command === "next-version-code") {
  console.log(await nextVersionCode(api, Number(flags.min ?? 1)));
} else if (command === "upload") {
  const [aab, name] = rest;
  if (!aab || !name) throw new Error("usage: play-publish.mjs upload <package> <aab> <release-name> [--track internal] [--draft]");
  await uploadBundle(api, aab, name, flags.track ?? "internal", Boolean(flags.draft));
} else {
  throw new Error(`unknown command ${command}`);
}
