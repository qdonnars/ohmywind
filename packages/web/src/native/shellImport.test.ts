// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { encodePayload } from "../storage/transfer";
import {
  handleReturnUrl,
  readShellImportState,
  restartShellImport,
  startShellImport,
  type InstallInfo,
  type ShellDeps,
} from "./shellImport";

const STATE_KEY = "ow_shell_import_v1";
const NONCE = "0123456789abcdef0123456789abcdef";
const ORIGIN = "https://ohmywind.fr";

const UPDATED: InstallInfo = { firstInstallTime: 1_000, lastUpdateTime: 2_000 };
const FRESH: InstallInfo = { firstInstallTime: 1_000, lastUpdateTime: 1_000 };

function returnUrl(items: Record<string, string>, nonce = NONCE, v = "1"): string {
  return `ohmywind://import?v=${v}&n=${nonce}&d=${encodePayload(items)}`;
}

interface Harness {
  deps: ShellDeps;
  data: Map<string, string>;
  openBrowser: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  /** Deliver a URL to the running app, as `appUrlOpen` would. */
  deliver(url: string): void;
}

function harness(
  options: {
    data?: Record<string, string>;
    installInfo?: InstallInfo | Error;
    launchUrl?: string;
    openFails?: boolean;
    setItemFails?: boolean;
    now?: number;
  } = {},
): Harness {
  const data = new Map(Object.entries(options.data ?? {}));
  const listeners: ((url: string) => void)[] = [];
  const openBrowser = vi.fn(async () => {
    if (options.openFails) throw new Error("no browser");
  });
  const reload = vi.fn();
  const deps: ShellDeps = {
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (options.setItemFails) throw new Error("QuotaExceededError");
        data.set(k, v);
      },
    },
    origin: ORIGIN,
    getInstallInfo: async () => {
      const info = options.installInfo ?? UPDATED;
      if (info instanceof Error) throw info;
      return info;
    },
    openBrowser,
    getLaunchUrl: async () => options.launchUrl,
    onAppUrlOpen: (listener) => {
      listeners.push(listener);
    },
    reload,
    randomNonce: () => NONCE,
    now: () => options.now ?? 42,
  };
  return {
    deps,
    data,
    openBrowser,
    reload,
    deliver: (url) => listeners.forEach((l) => l(url)),
  };
}

const pending = (nonce = NONCE) => JSON.stringify({ state: "pending", nonce, at: 1 });
const stateOf = (h: Harness) => readShellImportState(h.deps.storage)?.state;

describe("startShellImport, first boot", () => {
  it("opens the transfer page after an update", async () => {
    const h = harness({ installInfo: UPDATED });
    await startShellImport(h.deps);
    expect(readShellImportState(h.deps.storage)).toEqual({ state: "pending", nonce: NONCE, at: 42 });
    expect(h.openBrowser).toHaveBeenCalledWith(`${ORIGIN}/transfert?n=${NONCE}`);
  });

  it("does nothing on a fresh install", async () => {
    const h = harness({ installInfo: FRESH });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("none");
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("does nothing when the shell has no ShellInfo plugin", async () => {
    const h = harness({ installInfo: new Error("not implemented on ios") });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("none");
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("treats a malformed answer as no update", async () => {
    const h = harness({ installInfo: { firstInstallTime: NaN, lastUpdateTime: 5 } });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("none");
  });

  it("does not open the browser when its state cannot be saved", async () => {
    // Otherwise every launch would find no state and open it again.
    const h = harness({ setItemFails: true });
    await startShellImport(h.deps);
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("gives up when the browser does not open", async () => {
    const h = harness({ openFails: true });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("failed");
  });
});

describe("startShellImport, later boots", () => {
  it("marks a stale pending transfer with no return as failed, without retrying", async () => {
    const h = harness({ data: { [STATE_KEY]: pending() }, now: 10 * 60 * 1000 });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("failed");
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("keeps waiting when the page reloads while the transfer is under way", async () => {
    const h = harness({ data: { [STATE_KEY]: pending() }, now: 30 * 1000 });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("pending");
    expect(h.openBrowser).not.toHaveBeenCalled();
    h.deliver(returnUrl({ ow_lang: "de" }));
    expect(stateOf(h)).toBe("done");
    expect(h.data.get("ow_lang")).toBe("de");
  });

  it("gives up on a pending transfer dated in the future", async () => {
    const h = harness({
      data: { [STATE_KEY]: JSON.stringify({ state: "pending", nonce: NONCE, at: 5_000 }) },
      now: 1_000,
    });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("failed");
  });

  it.each(["done", "none", "failed"])("leaves a %s state alone", async (state) => {
    const h = harness({ data: { [STATE_KEY]: JSON.stringify({ state, at: 1 }) } });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe(state);
    expect(h.openBrowser).not.toHaveBeenCalled();
  });

  it("decides again over a corrupt state", async () => {
    const h = harness({ data: { [STATE_KEY]: "{oops" }, installInfo: FRESH });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("none");
  });

  it("imports from a cold-start URL before judging the pending state", async () => {
    const h = harness({
      data: { [STATE_KEY]: pending() },
      launchUrl: returnUrl({ ow_theme: "dark" }),
    });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("done");
    expect(h.data.get("ow_theme")).toBe("dark");
    expect(h.reload).toHaveBeenCalledOnce();
  });

  it("does nothing on the reload that follows, the launch URL still set", async () => {
    const h = harness({
      data: { [STATE_KEY]: JSON.stringify({ state: "done", at: 1 }), ow_theme: "dark" },
      launchUrl: returnUrl({ ow_theme: "light" }),
    });
    await startShellImport(h.deps);
    expect(stateOf(h)).toBe("done");
    expect(h.data.get("ow_theme")).toBe("dark");
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.openBrowser).not.toHaveBeenCalled();
  });
});

describe("the return URL", () => {
  it("writes the absent keys, keeps the existing ones, then reloads", async () => {
    const h = harness();
    await startShellImport(h.deps);
    h.data.set("ow_lang", "en");
    h.deliver(
      returnUrl({ ohmywind_custom_spots: "[{\"name\":\"Groix\"}]", ow_lang: "fr", ow_theme: "dark" }),
    );
    expect(h.data.get("ohmywind_custom_spots")).toBe("[{\"name\":\"Groix\"}]");
    expect(h.data.get("ow_theme")).toBe("dark");
    expect(h.data.get("ow_lang")).toBe("en");
    expect(stateOf(h)).toBe("done");
    expect(h.reload).toHaveBeenCalledOnce();
  });

  it("ignores keys that do not transfer", async () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    handleReturnUrl(returnUrl({ ow_theme: "dark", ow_geoloc_declined_v1: "1", unknown: "x" }), h.deps);
    expect(h.data.get("ow_theme")).toBe("dark");
    expect(h.data.has("ow_geoloc_declined_v1")).toBe(false);
    expect(h.data.has("unknown")).toBe(false);
  });

  it("closes the loop without reloading when there was nothing to bring", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    expect(handleReturnUrl(returnUrl({}), h.deps)).toBe("imported");
    expect(stateOf(h)).toBe("done");
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("ignores a wrong nonce", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    expect(handleReturnUrl(returnUrl({ ow_theme: "dark" }, "f".repeat(32)), h.deps)).toBe("ignored");
    expect(h.data.has("ow_theme")).toBe(false);
    expect(stateOf(h)).toBe("pending");
  });

  it("ignores another version", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    expect(handleReturnUrl(returnUrl({ ow_theme: "dark" }, NONCE, "2"), h.deps)).toBe("ignored");
    expect(stateOf(h)).toBe("pending");
  });

  it.each(["done", "none", "failed"])("ignores a return in state %s, even with the old nonce", (state) => {
    const h = harness({ data: { [STATE_KEY]: JSON.stringify({ state, nonce: NONCE, at: 1 }) } });
    expect(handleReturnUrl(returnUrl({ ow_theme: "dark" }), h.deps)).toBe("ignored");
    expect(h.data.has("ow_theme")).toBe(false);
    expect(stateOf(h)).toBe(state);
  });

  it("ignores any URL that is not the import", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    expect(handleReturnUrl("https://ohmywind.fr/plan", h.deps)).toBe("ignored");
    expect(stateOf(h)).toBe("pending");
  });

  it("marks a garbled payload with the right nonce as failed", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    expect(handleReturnUrl(`ohmywind://import?v=1&n=${NONCE}&d=%%%`, h.deps)).toBe("failed");
    expect(stateOf(h)).toBe("failed");
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("is applied once when the same URL arrives twice", () => {
    const h = harness({ data: { [STATE_KEY]: pending() } });
    const url = returnUrl({ ow_theme: "dark" });
    expect(handleReturnUrl(url, h.deps)).toBe("imported");
    expect(handleReturnUrl(url, h.deps)).toBe("ignored");
    expect(h.reload).toHaveBeenCalledOnce();
  });
});

describe("restartShellImport", () => {
  it("opens the transfer page again whatever the state", async () => {
    const h = harness({ data: { [STATE_KEY]: JSON.stringify({ state: "failed", at: 1 }) } });
    await restartShellImport(h.deps);
    expect(stateOf(h)).toBe("pending");
    expect(h.openBrowser).toHaveBeenCalledWith(`${ORIGIN}/transfert?n=${NONCE}`);
  });
});
