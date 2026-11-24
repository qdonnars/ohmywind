// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { TRANSFERABLE_KEYS, encodePayload } from "../storage/transfer";
import {
  BACKUP_DELAY_MS,
  BACKUP_KEYS,
  BACKUP_POLICY,
  createBackupWriter,
  parseBackup,
  restoreIfWiped,
  snapshot,
  watchStorageWrites,
  type BackupDeps,
} from "./nativeBackup";

const K = LOCAL_STORAGE_KEYS;

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  constructor(entries: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(entries)) this.m.set(k, v);
  }
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

function deps(storage: Storage, copy: string | null) {
  const d = {
    storage,
    copy,
    readCopy: vi.fn(async () => d.copy),
    writeCopy: vi.fn(async (v: string) => {
      d.copy = v;
    }),
    reload: vi.fn(),
  };
  return d satisfies BackupDeps & { copy: string | null };
}

const USER_DATA = {
  [K.customSpots]: '[{"name":"Porquerolles"}]',
  [K.polarConfig]: '{"v":3}',
  [K.theme]: "dark",
  [K.lastSimulation]: '{"single":{}}',
  [K.shellImport]: '{"state":"done","at":1}',
};

describe("backup policy", () => {
  it("decides for every localStorage key", () => {
    expect(Object.keys(BACKUP_POLICY).sort()).toEqual(Object.keys(K).sort());
  });

  it("keeps everything the former app's transfer keeps, and the last plan", () => {
    for (const key of TRANSFERABLE_KEYS) expect(BACKUP_KEYS).toContain(key);
    expect(BACKUP_KEYS).toContain(K.lastSimulation);
    expect(BACKUP_KEYS).toContain(K.shellImport);
  });

  it("never keeps the marker, the caches or the rating clock", () => {
    for (const key of [K.nativeBackup, K.marcCoverage, K.waypointDepths, K.reviewPrompt]) {
      expect(BACKUP_KEYS).not.toContain(key);
    }
  });
});

describe("snapshot and parseBackup", () => {
  it("round-trip the backed-up entries only", () => {
    const s = new MemoryStorage({ ...USER_DATA, [K.marcCoverage]: "{}", other: "x" });
    expect(parseBackup(snapshot(s))).toEqual(USER_DATA);
  });

  it("refuse what is not a copy, and drop unknown keys", () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup("not base64 !")).toBeNull();
    expect(parseBackup(encodePayload({ evil: "1", [K.theme]: "light" }))).toEqual({ [K.theme]: "light" });
  });
});

describe("restoreIfWiped", () => {
  it("puts a wiped storage back and reloads once", async () => {
    const wiped = new MemoryStorage();
    const d = deps(wiped, snapshot(new MemoryStorage(USER_DATA)));
    expect(await restoreIfWiped(d)).toBe("restored");
    for (const [k, v] of Object.entries(USER_DATA)) expect(wiped.getItem(k)).toBe(v);
    expect(wiped.getItem(K.nativeBackup)).toBe("1");
    expect(d.reload).toHaveBeenCalledTimes(1);
    // The reloaded page finds the marker: no second restore, no loop.
    expect(await restoreIfWiped(d)).toBe("kept");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("never overwrites what the storage holds", async () => {
    const s = new MemoryStorage({ [K.theme]: "light" });
    const d = deps(s, snapshot(new MemoryStorage(USER_DATA)));
    expect(await restoreIfWiped(d)).toBe("restored");
    expect(s.getItem(K.theme)).toBe("light");
    expect(s.getItem(K.customSpots)).toBe(USER_DATA[K.customSpots]);
  });

  it("restores nothing once the storage is known, even with entries missing", async () => {
    const s = new MemoryStorage({ [K.nativeBackup]: "1" });
    const d = deps(s, snapshot(new MemoryStorage(USER_DATA)));
    expect(await restoreIfWiped(d)).toBe("kept");
    expect(s.getItem(K.customSpots)).toBeNull();
    expect(d.readCopy).not.toHaveBeenCalled();
  });

  it("does not reload when there is no copy or nothing to write", async () => {
    const fresh = deps(new MemoryStorage(), null);
    expect(await restoreIfWiped(fresh)).toBe("nothing");
    const same = new MemoryStorage(USER_DATA);
    const d = deps(same, snapshot(same));
    expect(await restoreIfWiped(d)).toBe("nothing");
    expect(fresh.reload).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("does nothing when the marker cannot be stored, so it cannot loop", async () => {
    const s = new MemoryStorage();
    s.setItem = () => undefined;
    const d = deps(s, snapshot(new MemoryStorage(USER_DATA)));
    expect(await restoreIfWiped(d)).toBe("nothing");
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("says when the copy cannot be read", async () => {
    const d = deps(new MemoryStorage(), null);
    d.readCopy.mockRejectedValueOnce(new Error("plugin missing"));
    expect(await restoreIfWiped(d)).toBe("unavailable");
  });

  it("never restores the rating clock: a purge can only delay the request", async () => {
    const old = new MemoryStorage({ ...USER_DATA, [K.reviewPrompt]: '{"firstLaunchAt":1,"plans":9}' });
    const wiped = new MemoryStorage();
    await restoreIfWiped(deps(wiped, snapshot(old)));
    expect(wiped.getItem(K.reviewPrompt)).toBeNull();
  });
});

describe("createBackupWriter", () => {
  function fakeTimers() {
    const queue: (() => void)[] = [];
    return {
      queue,
      timers: {
        set: (fn: () => void, ms: number) => {
          expect(ms).toBe(BACKUP_DELAY_MS);
          queue.push(fn);
          return fn;
        },
        clear: (h: unknown) => {
          const i = queue.indexOf(h as () => void);
          if (i >= 0) queue.splice(i, 1);
        },
      },
    };
  }

  it("writes nothing before start, then a debounced copy after a change", async () => {
    const s = new MemoryStorage(USER_DATA);
    const d = deps(s, "previous");
    const { queue, timers } = fakeTimers();
    const w = createBackupWriter(d, timers);
    w.changed(K.theme);
    await w.flush();
    expect(d.writeCopy).not.toHaveBeenCalled();
    expect(d.copy).toBe("previous");
    w.start();
    w.changed(K.theme);
    w.changed(K.customSpots);
    expect(queue).toHaveLength(1);
    queue[0]();
    await w.flush();
    expect(d.writeCopy).toHaveBeenCalledTimes(1);
    expect(parseBackup(d.copy)).toEqual(USER_DATA);
  });

  it("ignores keys outside the copy and skips identical copies", async () => {
    const s = new MemoryStorage(USER_DATA);
    const d = deps(s, null);
    const { queue, timers } = fakeTimers();
    const w = createBackupWriter(d, timers);
    w.start();
    w.changed(K.marcCoverage);
    expect(queue).toHaveLength(0);
    await w.flush();
    await w.flush();
    expect(d.writeCopy).toHaveBeenCalledTimes(1);
  });
});

describe("watchStorageWrites", () => {
  it("hears writes to the watched storage only, after they succeed", () => {
    class Isolated extends MemoryStorage {}
    const watched = new Isolated();
    const other = new Isolated();
    const heard: (string | null)[] = [];
    watchStorageWrites(watched, (k) => heard.push(k));
    watched.setItem("a", "1");
    watched.removeItem("a");
    other.setItem("b", "2");
    watched.clear();
    expect(heard).toEqual(["a", "a", null]);
    expect(watched.getItem("a")).toBeNull();
    expect(other.getItem("b")).toBe("2");
  });

  it("lets a failing write throw as before, without a notification", () => {
    class Full extends MemoryStorage {
      setItem(_key: string, _value: string): void {
        throw new Error(`QuotaExceededError: ${_key}=${_value}`);
      }
    }
    const s = new Full();
    const heard: (string | null)[] = [];
    watchStorageWrites(s, (k) => heard.push(k));
    expect(() => s.setItem("a", "1")).toThrow(/QuotaExceededError/);
    expect(heard).toEqual([]);
  });
});
