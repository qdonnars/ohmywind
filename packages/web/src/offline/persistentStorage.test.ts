// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistMayPrompt, requestPersistentStorage, resetPersistRequest } from "./persistentStorage";

const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
const FX_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15";

beforeEach(() => resetPersistRequest());

describe("persistent storage", () => {
  it("knows which engine prompts", () => {
    expect(persistMayPrompt(FIREFOX)).toBe(true);
    expect(persistMayPrompt(CHROME)).toBe(false);
    expect(persistMayPrompt(FX_IOS)).toBe(false);
  });

  it("asks once per page where it cannot prompt", async () => {
    const storage = { persisted: vi.fn(() => Promise.resolve(false)), persist: vi.fn(() => Promise.resolve(true)) };
    expect(await requestPersistentStorage({ userAgent: CHROME, storage })).toBe(true);
    expect(await requestPersistentStorage({ userAgent: CHROME, storage })).toBeNull();
    expect(storage.persist).toHaveBeenCalledTimes(1);
  });

  it("does not ask again what is already granted", async () => {
    const storage = { persisted: vi.fn(() => Promise.resolve(true)), persist: vi.fn(() => Promise.resolve(true)) };
    expect(await requestPersistentStorage({ userAgent: CHROME, storage })).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("never asks Firefox, never throws", async () => {
    const storage = { persisted: vi.fn(() => Promise.resolve(false)), persist: vi.fn(() => Promise.resolve(true)) };
    expect(await requestPersistentStorage({ userAgent: FIREFOX, storage })).toBeNull();
    expect(storage.persist).not.toHaveBeenCalled();

    resetPersistRequest();
    const broken = { persisted: () => Promise.reject(new Error("x")), persist: () => Promise.reject(new Error("x")) };
    expect(await requestPersistentStorage({ userAgent: CHROME, storage: broken })).toBeNull();
    resetPersistRequest();
    expect(await requestPersistentStorage({ userAgent: CHROME, storage: undefined })).toBeNull();
  });
});
