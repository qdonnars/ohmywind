// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one place a JSON body leaves the browser, and the one place it is gzipped.
 *
 * A passage request without `forecast_cache` is a few hundred bytes. One with
 * it, measured live on a 63 NM Mediterranean route, is 44 KB: the corridor
 * carries a week of hourly wind for four models at fifteen points, and that is
 * exactly the payload the mobile reader uploads on a slow link before anything
 * appears. Gzipped it is 9.6 KB. The response has been compressed since #317;
 * this is the other direction, which nobody had asked the browser to do.
 *
 * ## Negotiation, without a round trip to ask
 *
 * There is no capability endpoint, so the module tries and remembers. Three
 * states, per page load:
 *
 * | state | what it means | what the next POST does |
 * |---|---|---|
 * | `unknown` | nothing tried yet | compress, and watch |
 * | `gzip` | a compressed body was accepted | compress |
 * | `identity` | a compressed body was refused | never compress again |
 *
 * Two refusals are recognised, because a server that does not decompress can
 * fail in two very different ways:
 *
 * - **415.** The request reached the server, which understood the header and
 *   said no. Unambiguous.
 * - **A transport failure on a body we have never seen accepted.** The
 *   `Content-Encoding` request header is not CORS-safelisted, so it has to be
 *   in the preflight's `Access-Control-Allow-Headers`. A server that
 *   decompresses but forgot to allow the header makes the browser refuse to
 *   send the request at all, and `fetch` rejects with a `TypeError` that looks
 *   exactly like an outage. Retrying once uncompressed costs one request per
 *   page load and tells the two apart: if the plain retry fails too, its error
 *   is the one that reaches the caller, so a real outage is still reported as
 *   an outage.
 *
 * An abort is never a refusal: `AbortError` and `TimeoutError` propagate
 * untouched, or a newer computation cancelling an older one would be read as
 * a server that hates gzip.
 *
 * ## What is not compressed
 *
 * Bodies under `MIN_GZIP_BYTES`. Below a kilobyte the gzip header and the
 * CPU cost more than the bytes saved, and the small bodies are exactly the
 * ones that were never a problem. A page that only ever sends small bodies
 * therefore stays in `unknown` and never spends the probing retry.
 */

/** Below this, compressing is a loss. See the module doc. */
const MIN_GZIP_BYTES = 1024;

type BodyEncoding = "unknown" | "gzip" | "identity";

let state: BodyEncoding = "unknown";

/** Test seam: the state is a page-load fact, and tests need several. */
export function resetBodyEncoding(): void {
  state = "unknown";
}

/** What the last POST decided. Exported for the tests and for debugging. */
export function bodyEncoding(): BodyEncoding {
  return state;
}

function canCompress(): boolean {
  return typeof CompressionStream !== "undefined";
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

/** An abort or a timeout, which must never be mistaken for a server verdict. */
function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * POST a JSON body, gzipped when that is worth it and the server takes it.
 *
 * Returns the `Response` untouched, error statuses included: reading the error
 * contract stays the caller's business (`toError` in `passage.ts`).
 */
export async function postJson(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const json = JSON.stringify(body);
  const plain = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      signal,
    });

  const worthIt = json.length >= MIN_GZIP_BYTES;
  if (state === "identity" || !worthIt || !canCompress()) return plain();

  const probing = state === "unknown";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      body: await gzip(json),
      signal,
    });
  } catch (error) {
    // A preflight that refused `Content-Encoding` lands here, and so does a
    // genuine outage. Probe once; after that the encoding is settled and the
    // error is the caller's.
    if (isAbort(error) || !probing) throw error;
    state = "identity";
    return plain();
  }

  if (res.status === 415) {
    state = "identity";
    return plain();
  }
  state = "gzip";
  return res;
}
