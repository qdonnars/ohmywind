// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { common } from "./fr/common";
import { config } from "./fr/config";
import { explore } from "./fr/explore";
import { panel } from "./fr/panel";
import { plan } from "./fr/plan";
import { it as itDict } from "./it";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

const NAMESPACES: Array<[string, Record<string, string>]> = [
  ["common", common],
  ["config", config],
  ["explore", explore],
  ["plan", plan],
  ["panel", panel],
];

/** Every translation, keyed by language, checked against the French reference. */
const TRANSLATIONS: Array<[string, Record<keyof typeof fr, string>]> = [
  ["en", en],
  ["de", de],
  ["it", itDict],
];

describe("dictionnaires", () => {
  it.each(TRANSLATIONS)("%s couvre exactement les clés du français", (_lang, d) => {
    expect(Object.keys(d).sort()).toEqual(Object.keys(fr).sort());
  });

  it("aucune valeur vide", () => {
    for (const [, d] of [["fr", fr], ...TRANSLATIONS] as const) {
      for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe("");
    }
  });

  it.each(TRANSLATIONS)("%s : mêmes paramètres et mêmes balises que le français", (_lang, d) => {
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(placeholders(d[k]), k).toEqual(placeholders(fr[k]));
      expect(tags(d[k]), k).toEqual(tags(fr[k]));
    }
  });

  it("chaque fichier ne porte que son préfixe, donc aucune collision", () => {
    for (const [prefix, d] of NAMESPACES) {
      for (const k of Object.keys(d)) expect(k.startsWith(`${prefix}.`), k).toBe(true);
    }
  });

  it("une clé au pluriel a ses deux formes", () => {
    for (const k of Object.keys(fr)) {
      if (k.endsWith(".one")) expect(fr).toHaveProperty(k.replace(/\.one$/, ".other"));
    }
  });
});
