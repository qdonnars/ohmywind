// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n";
import { alertsOf } from "./sidebar/alerts";
import { noticeText, passageNotices } from "./notices";
import type { ComplexityScore, PassageReport } from "./types";

const LIGHT_WIND = {
  code: "passage.light_wind",
  params: { min_speed_kn: "2.6" },
  message: "vent faible : vitesse mini 2.6 kn, passage très lent",
};

function passage(over: Partial<PassageReport> = {}): PassageReport {
  return {
    archetype: "cruiser_30ft",
    departure_time: "2026-09-18T06:00:00+00:00",
    arrival_time: "2026-09-18T12:00:00+00:00",
    duration_h: 6,
    distance_nm: 30,
    efficiency: 0.75,
    model: "arome",
    segments: [],
    warnings: [LIGHT_WIND.message],
    notices: [LIGHT_WIND],
    ...over,
  };
}

function complexity(over: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    level: 3,
    label: "soutenu",
    wind_level: 3,
    wind_label: "soutenu",
    sea_level: 3,
    sea_label: "agitée",
    tws_max_kn: 18,
    hs_max_m: 1.5,
    rationale: "",
    ...over,
  };
}

describe("noticeText", () => {
  afterEach(async () => {
    await setLang("fr");
  });

  it("says a coded warning in the active language, with the server's values", async () => {
    expect(noticeText(LIGHT_WIND)).toBe("vent faible : vitesse mini 2.6 kn, passage très lent");
    await setLang("en");
    expect(noticeText(LIGHT_WIND)).toBe("light wind: minimum speed 2.6 kn, a very slow passage");
  });

  it("falls back to the server's sentence for a code it does not know", async () => {
    await setLang("en");
    const newer = { code: "passage.something_new", params: {}, message: "phrase du serveur" };
    expect(noticeText(newer)).toBe("phrase du serveur");
    expect(noticeText({ code: "", params: {}, message: "sans code" })).toBe("sans code");
  });
});

describe("passageNotices", () => {
  it("uses the sentences when the server sent no notices, or not one per warning", () => {
    expect(passageNotices(passage({ notices: undefined }))).toEqual([
      { code: "", params: {}, message: LIGHT_WIND.message },
    ]);
    expect(passageNotices(passage({ notices: [] }))).toEqual([
      { code: "", params: {}, message: LIGHT_WIND.message },
    ]);
    expect(passageNotices(passage())).toEqual([LIGHT_WIND]);
  });
});

describe("alertsOf", () => {
  afterEach(async () => {
    await setLang("fr");
  });

  it("lists the score's warnings then the engine's, each translated and sorted by kind", async () => {
    await setLang("de");
    const alerts = alertsOf(
      passage(),
      complexity({
        warnings: [
          {
            kind: "sea",
            level: 3,
            message: "Mer agitée : Hs 1.2-1.9 m sur 15 nm",
            affected_segments: [0],
            code: "complexity.sea.3",
            params: { hs_range: "1.2-1.9", nm: "15" },
          },
          {
            kind: "chop",
            level: 3,
            message: "Clapot suiveur : Hs 0.9 m à Tp 4 s sur 8 nm",
            affected_segments: [1],
            code: "complexity.chop_following",
            params: { hs_range: "0.9", tp_range: "4", nm: "8" },
          },
        ],
      }),
    );
    expect(alerts).toEqual([
      { kind: "sea", message: "Grobe See: Hs 1.2-1.9 m auf 15 nm" },
      { kind: "sea", message: "Mitlaufende Kabbelsee: Hs 0.9 m bei Tp 4 s auf 8 nm" },
      { kind: "wind", message: "schwacher Wind: Mindestgeschwindigkeit 2.6 kn, sehr langsame Passage" },
    ]);
  });

  it("still shows an older server's sentences, classified by their words", () => {
    const alerts = alertsOf(
      passage({ notices: undefined, warnings: ["vent faible : vitesse mini 2.6 kn, passage très lent"] }),
      complexity({
        warnings: [{ kind: "wind", level: 3, message: "Vent soutenu : TWS 18 kn sur 5 nm", affected_segments: [0] }],
      }),
    );
    expect(alerts).toEqual([
      { kind: "wind", message: "Vent soutenu : TWS 18 kn sur 5 nm" },
      { kind: "wind", message: "vent faible : vitesse mini 2.6 kn, passage très lent" },
    ]);
  });
});
