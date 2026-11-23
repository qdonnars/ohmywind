// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { readIncomingItems } from "../storage/transfer";
import { BRIDGE_VERSION, TRANSFER_PATH, parseReturnUrl } from "./bridgeUrl";

/**
 * One-shot import, into the native shell's WebView, of what the former
 * Android app (a TWA) left in Chrome's storage.
 *
 * The TWA ran in Chrome, so spots, boat and settings live in Chrome's
 * storage for ohmywind.fr. The shell loads the same site in the system
 * WebView, which has a storage of its own and starts empty: without this,
 * updating the app would look like losing everything. At the first launch
 * after an update, the app opens `/transfert` in a Custom Tab (Chrome, with
 * the old storage), that page sends the data back in a URL, and the app
 * writes what it does not already have.
 *
 * The state machine, persisted under `ow_shell_import_v1`:
 *
 * - absent: never decided. A fresh install has nothing to fetch (`none`); an
 *   update goes `pending` and opens the page.
 * - `pending`: waiting for the return URL, which must carry the nonce stored
 *   with it. Found at boot with no return URL and older than a few minutes,
 *   the reader closed the tab or the return failed: `failed`, and no
 *   automatic retry, so a broken return cannot reopen a browser at every
 *   launch. A recent one is left waiting: the page merely reloaded.
 * - `done`, `none`, `failed`: final. Anything arriving afterwards is ignored.
 *
 * Capacitor stays out of this module: the plugins come in through `ShellDeps`
 * (see `capacitorShell.ts`), which keeps the logic testable in Node.
 */

type ShellImportStatus = "pending" | "done" | "none" | "failed";

export interface ShellImportState {
  state: ShellImportStatus;
  nonce?: string;
  /** ms since epoch, when the state was written. */
  at: number;
}

export interface InstallInfo {
  firstInstallTime: number;
  lastUpdateTime: number;
}

export interface ShellDeps {
  /** Capacitor's platform name ("android", "ios"). */
  platform: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Origin of the site the shell loads, which serves `/transfert` too. */
  origin: string;
  /** Rejects when the shell has no such plugin (an older build). */
  getInstallInfo(): Promise<InstallInfo>;
  openBrowser(url: string): Promise<void>;
  /** URL the app was cold-started with, if any. */
  getLaunchUrl(): Promise<string | undefined>;
  /** URLs delivered to the running app. */
  onAppUrlOpen(listener: (url: string) => void): void;
  reload(): void;
  randomNonce(): string;
  now(): number;
}

const STATE_KEY = LOCAL_STORAGE_KEYS.shellImport;

/**
 * How long a `pending` state found at boot is still given the benefit of the
 * doubt. The page can reload while the Custom Tab is in front (a service
 * worker update, the system reclaiming the WebView): the return is then
 * still on its way, and calling it failed would throw the data away a second
 * before it arrives. Past this delay the tab was closed or the return lost.
 */
const PENDING_GRACE_MS = 5 * 60 * 1000;
const STATUSES: readonly string[] = ["pending", "done", "none", "failed"];

/**
 * The former app was a TWA, which only ever existed on Android. Anywhere else
 * there is no Chrome storage to read and no `ShellInfo` plugin to ask: the
 * bridge must not even start, let alone open a browser.
 */
function hasFormerApp(deps: ShellDeps): boolean {
  return deps.platform === "android";
}

export function readShellImportState(storage: Pick<Storage, "getItem">): ShellImportState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STATE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { state, nonce, at } = v as Record<string, unknown>;
    if (typeof state !== "string" || !STATUSES.includes(state)) return null;
    return {
      state: state as ShellImportStatus,
      ...(typeof nonce === "string" ? { nonce } : {}),
      at: typeof at === "number" ? at : 0,
    };
  } catch {
    return null;
  }
}

function writeState(deps: ShellDeps, state: ShellImportStatus, nonce?: string): void {
  const value: ShellImportState = { state, ...(nonce ? { nonce } : {}), at: deps.now() };
  try {
    deps.storage.setItem(STATE_KEY, JSON.stringify(value));
  } catch {
    /* storage refused: the read-back in openTransfer catches it */
  }
}

/** 16 random bytes in hex, from the platform's CSPRNG. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function openTransfer(deps: ShellDeps): Promise<void> {
  const nonce = deps.randomNonce();
  writeState(deps, "pending", nonce);
  // Opening the browser with a state that did not stick would reopen it at
  // every launch: the next boot would still find no state.
  if (readShellImportState(deps.storage)?.nonce !== nonce) return;
  try {
    await deps.openBrowser(`${deps.origin}${TRANSFER_PATH}?n=${nonce}`);
  } catch {
    writeState(deps, "failed");
  }
}

export type ReturnOutcome = "imported" | "ignored" | "failed";

/**
 * A URL delivered to the app. Only the return of the transfer this app
 * started is acted on: right scheme, right version, the nonce of a pending
 * state. Anything else, a replay, a stale tab, another page's link, is
 * ignored without a trace.
 */
export function handleReturnUrl(url: string, deps: ShellDeps): ReturnOutcome {
  const params = parseReturnUrl(url);
  if (!params) return "ignored";
  const current = readShellImportState(deps.storage);
  if (current?.state !== "pending" || !current.nonce) return "ignored";
  if (params.v !== BRIDGE_VERSION || params.n !== current.nonce) return "ignored";

  const items = readIncomingItems(params.d);
  if (items === null) {
    writeState(deps, "failed");
    return "failed";
  }
  let written = 0;
  for (const [key, value] of Object.entries(items)) {
    try {
      // Never overwrite: whatever the app already holds is either newer or
      // the reader's own choice since the update.
      if (deps.storage.getItem(key) !== null) continue;
      deps.storage.setItem(key, value);
      written += 1;
    } catch {
      /* quota or blocked storage: keep what fitted */
    }
  }
  writeState(deps, "done");
  // No call to close the tab: the return intent brings the app's activity
  // back to the front, which finishes the Custom Tab above it. Asking the
  // browser plugin to close a tab that is already gone starts an invisible
  // activity over the app, and the app then ignores every touch.
  // Every module read its storage at startup; a reload is the one way to
  // have them all see the imported values. Nothing written, nothing to see.
  if (written > 0) deps.reload();
  return "imported";
}

function isTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Called once per page load in the native shell. */
export async function startShellImport(deps: ShellDeps): Promise<void> {
  deps.onAppUrlOpen((url) => {
    handleReturnUrl(url, deps);
  });

  // The app may have been killed while the Custom Tab was in front: the
  // return then arrives as the URL of a cold start, not as an event.
  let launchUrl: string | undefined;
  try {
    launchUrl = await deps.getLaunchUrl();
  } catch {
    launchUrl = undefined;
  }
  if (launchUrl && handleReturnUrl(launchUrl, deps) !== "ignored") return;

  const current = readShellImportState(deps.storage);
  if (current === null) {
    if (!hasFormerApp(deps)) {
      writeState(deps, "none");
      return;
    }
    let info: InstallInfo;
    try {
      info = await deps.getInstallInfo();
    } catch {
      // No plugin (an older shell): nothing tells an update from a fresh install.
      writeState(deps, "none");
      return;
    }
    const updated =
      isTimestamp(info?.firstInstallTime) &&
      isTimestamp(info?.lastUpdateTime) &&
      info.lastUpdateTime > info.firstInstallTime;
    if (!updated) {
      writeState(deps, "none");
      return;
    }
    await openTransfer(deps);
    return;
  }
  if (current.state === "pending") {
    const age = deps.now() - current.at;
    // A clock set backwards gives a negative age: treated as stale rather
    // than as a wait that could never end.
    if (age < 0 || age > PENDING_GRACE_MS) writeState(deps, "failed");
  }
}

/**
 * Start the bridge again, whatever its state. For a manual entry in the
 * settings; nothing calls it automatically.
 */
export function restartShellImport(deps: ShellDeps): Promise<void> {
  if (!hasFormerApp(deps)) return Promise.resolve();
  return openTransfer(deps);
}
