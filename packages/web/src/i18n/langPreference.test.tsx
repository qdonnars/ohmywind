// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { beforeEach, describe, expect, it } from "vitest";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";
import { readStoredLang, saveLang } from "./langPreference";

beforeEach(() => {
  localStorage.clear();
});

describe("langPreference", () => {
  it("n'a rien à dire tant que rien n'est choisi", () => {
    expect(readStoredLang()).toBeNull();
  });

  it("relit ce qui a été choisi", () => {
    saveLang("en");
    expect(readStoredLang()).toBe("en");
  });

  it("ignore une valeur inconnue ou une langue pas encore livrée", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.lang, "klingon");
    expect(readStoredLang()).toBeNull();
    localStorage.setItem(LOCAL_STORAGE_KEYS.lang, "de");
    expect(readStoredLang()).toBeNull();
  });
});
