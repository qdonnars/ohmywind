// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The product version: one number for the site and the MCP server, the one
 * released on main and described in CHANGELOG.md. The Android app keeps its
 * own store version (packages/android/twa-manifest.json).
 *
 * Read from packages/web/package.json at build time (`define` in
 * vite.config.ts), so bumping that one field is all a release asks of the web.
 */
export const APP_VERSION: string = __APP_VERSION__;

/** "1.8.0" as numbers, or null for anything that is not plain x.y.z. */
function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Semver order of two x.y.z versions: negative when `a` is older, positive
 * when it is newer, 0 when equal. A malformed version sorts below every valid
 * one, so a stray value in storage reads as "older than anything shipped".
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a) ?? [-1, -1, -1];
  const pb = parseVersion(b) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
