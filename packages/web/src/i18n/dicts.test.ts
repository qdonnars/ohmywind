// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import { common } from "./fr/common";
import { config } from "./fr/config";
import { explore } from "./fr/explore";
import { legs } from "./fr/legs";
import { plan } from "./fr/plan";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const NAMESPACES: Array<[string, Record<string, string>]> = [
  ["common", common],
  ["config", config],
  ["explore", explore],
  ["plan", plan],
  ["legs", legs],
];

describe("dictionnaires", () => {
  it("l'anglais couvre exactement les clés du français", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it("aucune valeur vide", () => {
    for (const d of [fr, en]) {
      for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe("");
    }
  });

  it("mêmes paramètres des deux côtés", () => {
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(placeholders(en[k]), k).toEqual(placeholders(fr[k]));
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
