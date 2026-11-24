// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LEGACY_STORAGE_KEYS, LOCAL_STORAGE_KEYS, type LocalStorageKeyName } from "./keys";

/**
 * Which `localStorage` entries follow the reader from one storage to another,
 * and the payload that carries them.
 *
 * The first user is the move from the Android TWA to the Capacitor shell: the
 * TWA kept everything in Chrome's storage for ohmywind.fr, the shell's WebView
 * starts empty, and `/transfert` (opened in Chrome) hands the data back to the
 * app. See `native/shellImport.ts` for the receiving end.
 *
 * Every key of the registry has a decision here, typed as a `Record` over the
 * registry's names: a key added to `LOCAL_STORAGE_KEYS` without one is a
 * compile error, so nobody has to remember this file exists. `sessionStorage`
 * never transfers: it is the state of one tab, and the tab is gone.
 */

type TransferDecision =
  /** Carried across. `rank` 1 is the most precious, kept when the payload
      has to shrink; the highest rank is the first one dropped. */
  | { readonly transfer: true; readonly rank: number }
  | { readonly transfer: false };

const keep = (rank: number): TransferDecision => ({ transfer: true, rank });
const SKIP: TransferDecision = { transfer: false };

export const TRANSFER_POLICY: Readonly<Record<LocalStorageKeyName, TransferDecision>> = {
  // What the reader made and cannot easily make again: dropped last.
  customSpots: keep(1),
  polarConfig: keep(2),
  modelConfig: keep(3),
  // Preferences.
  lang: keep(4),
  theme: keep(5),
  timezone: keep(6),
  compare: keep(7),
  seamarksExplore: keep(8),
  seamarksPlan: keep(9),
  lastSpot: keep(10),
  keepAwake: keep(11),
  // Hints already seen: without them the app greets a regular as a newcomer.
  onboarding: keep(12),
  compareHint: keep(13),
  whatsNewSeen: keep(14),
  // Layout, cheapest to lose.
  drawerHeight: keep(15),
  sidebarWidth: keep(16),

  // Caches, refetched on demand.
  marcCoverage: SKIP,
  waypointDepths: SKIP,
  // Large and recomputable from the plan URL; it would eat most of the
  // payload for a passage whose forecast is probably stale by now.
  lastSimulation: SKIP,
  // A refusal given to Chrome says nothing about the app: the permission is
  // asked by the system there, and a stale "no" would hide the button.
  geolocDeclined: SKIP,
  // The bridge's own bookkeeping, specific to each storage.
  shellImport: SKIP,
};

/** Storage names that transfer, most precious first. */
export const TRANSFERABLE_KEYS: readonly string[] = (
  Object.entries(TRANSFER_POLICY) as [LocalStorageKeyName, TransferDecision][]
)
  .flatMap(([name, d]) => (d.transfer ? [{ key: LOCAL_STORAGE_KEYS[name], rank: d.rank }] : []))
  .sort((a, b) => a.rank - b.rank)
  .map((e) => e.key);

const TRANSFERABLE = new Set(TRANSFERABLE_KEYS);

/**
 * Ceiling on the encoded payload. It travels in a URL, through an Android
 * intent: both accept far more, but a smaller bound keeps the intent well
 * clear of the binder's transaction limit and bounds what the receiving end
 * has to parse from an untrusted URL.
 */
export const MAX_PAYLOAD_LENGTH = 64 * 1024;

export type TransferItems = Record<string, string>;

type ReadableStorage = Pick<Storage, "getItem">;

function read(storage: ReadableStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The transferable entries present in `storage`, most precious first.
 *
 * A key renamed since an early release is read under its old name when the
 * new one is absent: a TWA user who has not opened the app since the rename
 * still has it there, and the app only knows the new name.
 */
export function collectTransferableItems(storage: ReadableStorage): TransferItems {
  const legacy: Partial<Record<string, string>> = LEGACY_STORAGE_KEYS;
  const items: TransferItems = {};
  for (const [name, decision] of Object.entries(TRANSFER_POLICY) as [
    LocalStorageKeyName,
    TransferDecision,
  ][]) {
    if (!decision.transfer) continue;
    const key = LOCAL_STORAGE_KEYS[name];
    const legacyKey = legacy[name];
    const value = read(storage, key) ?? (legacyKey ? read(storage, legacyKey) : null);
    if (value !== null) items[key] = value;
  }
  return orderByPriority(items);
}

function orderByPriority(items: TransferItems): TransferItems {
  const ordered: TransferItems = {};
  for (const key of TRANSFERABLE_KEYS) if (key in items) ordered[key] = items[key];
  return ordered;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  // String.fromCharCode takes its bytes as arguments: chunked, so a large
  // payload cannot overflow the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) throw new Error("not base64url");
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((encoded.length + 3) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** base64url, unpadded, of the UTF-8 JSON `{ "items": { ... } }`. */
export function encodePayload(items: TransferItems): string {
  return toBase64Url(JSON.stringify({ items }));
}

/** Inverse of `encodePayload`. Throws on anything that is not one. */
export function decodePayload(encoded: string): unknown {
  return JSON.parse(fromBase64Url(encoded));
}

/**
 * The largest payload under `max`, kept in priority order.
 *
 * Greedy: each key, most precious first, goes in if the payload still fits
 * with it. A key is therefore never dropped to make room for a less precious
 * one, and a single oversized entry costs only itself rather than everything
 * ranked below it.
 */
export function fitPayload(
  items: TransferItems,
  max: number = MAX_PAYLOAD_LENGTH,
): { encoded: string; kept: TransferItems; dropped: string[] } {
  const ordered = orderByPriority(items);
  const whole = encodePayload(ordered);
  if (whole.length <= max) return { encoded: whole, kept: ordered, dropped: [] };

  const kept: TransferItems = {};
  const dropped: string[] = [];
  let encoded = encodePayload(kept);
  for (const [key, value] of Object.entries(ordered)) {
    const candidate = encodePayload({ ...kept, [key]: value });
    if (candidate.length <= max) {
      kept[key] = value;
      encoded = candidate;
    } else {
      dropped.push(key);
    }
  }
  return { encoded, kept, dropped };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The entries an incoming payload may write, or null when it is not a
 * payload at all.
 *
 * The payload arrives in a URL, so it is treated as untrusted: oversized or
 * malformed is rejected as a whole; an unknown key or a non-string value is
 * dropped on its own, so a newer exporter sending a key this build does not
 * know cannot spoil the rest.
 */
export function readIncomingItems(encoded: string): TransferItems | null {
  if (encoded.length > MAX_PAYLOAD_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = decodePayload(encoded);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.items)) return null;
  const items: TransferItems = {};
  for (const [key, value] of Object.entries(parsed.items)) {
    if (TRANSFERABLE.has(key) && typeof value === "string") items[key] = value;
  }
  return items;
}
