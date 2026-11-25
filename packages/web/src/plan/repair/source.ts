// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The land tiles of the server the app talks to (`/api/v1/land-tiles`).
 *
 * The same archive the server repairs routes on, so the app and the
 * connector see one shoreline. A tile never changes under an archive id,
 * and the server says so (`immutable`): the browser's HTTP cache keeps it.
 */

import { API_BASE } from "../../api/config";
import type { TileSource } from "./tiles";

const BASE = `${API_BASE}/api/v1/land-tiles`;
const TIMEOUT_MS = 8000;

async function bytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`land tiles ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

export const serverTiles: TileSource = {
  index: () => bytes(`${BASE}/index`),
  tile: (archiveId, tx, ty) => bytes(`${BASE}/${archiveId}/${tx}/${ty}`),
};
