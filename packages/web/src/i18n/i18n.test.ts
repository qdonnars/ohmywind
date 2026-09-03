// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import { detectLang } from "./langPreference";
import { getLang, getLocale, initI18n, setLang, t, tn } from "./store";
import { AVAILABLE_LANGS } from "./types";

afterEach(async () => {
  await setLang("fr");
});

describe("store", () => {
  it("parle français par défaut", () => {
    expect(getLang()).toBe("fr");
    expect(getLocale()).toBe("fr-FR");
    expect(t("common.loading")).toBe(fr["common.loading"]);
  });

  it("bascule en anglais à la demande", async () => {
    await setLang("en");
    expect(getLang()).toBe("en");
    expect(getLocale()).toBe("en-GB");
    expect(t("common.loading")).toBe(en["common.loading"]);
  });

  it("interpole les paramètres et laisse un nom inconnu visible", () => {
    expect(t("common.days.one", { count: 1 })).toBe("1 jour");
    expect(t("common.days.one", {})).toBe("{count} jour");
  });

  it("pluriel : le français compte zéro au singulier, l'anglais non", async () => {
    expect(tn("common.days", 0)).toBe("0 jour");
    expect(tn("common.days", 1)).toBe("1 jour");
    expect(tn("common.days", 2)).toBe("2 jours");
    await setLang("en");
    expect(tn("common.days", 0)).toBe("0 days");
    expect(tn("common.days", 1)).toBe("1 day");
  });

  it("démarre sur une langue disponible", async () => {
    expect(AVAILABLE_LANGS).toContain(await initI18n());
  });
});

describe("detectLang", () => {
  it("prend la première langue du navigateur que l'app parle", () => {
    expect(detectLang(["nl-NL", "fr-FR", "en"])).toBe("fr");
    expect(detectLang(["fr-CA"])).toBe("fr");
    expect(detectLang(["en-US"])).toBe("en");
  });

  it("retombe sur l'anglais sinon", () => {
    expect(detectLang(["es-ES", "pt"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});
