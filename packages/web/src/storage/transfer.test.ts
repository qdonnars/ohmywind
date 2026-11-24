// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { LEGACY_STORAGE_KEYS, LOCAL_STORAGE_KEYS, SESSION_STORAGE_KEYS } from "./keys";
import {
  MAX_PAYLOAD_LENGTH,
  TRANSFERABLE_KEYS,
  TRANSFER_POLICY,
  collectTransferableItems,
  decodePayload,
  encodePayload,
  fitPayload,
  readIncomingItems,
} from "./transfer";

function fakeStorage(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (k) => (k in entries ? entries[k] : null) };
}

describe("transfer policy", () => {
  it("decides for every localStorage key of the registry", () => {
    // The Record type already refuses a missing name at compile time; this
    // is the same rule for whoever reads the tests first.
    expect(Object.keys(TRANSFER_POLICY).sort()).toEqual(Object.keys(LOCAL_STORAGE_KEYS).sort());
  });

  it("pins what transfers, in priority order, and what does not", () => {
    // Changing either list changes what an updating user keeps: deliberate.
    expect(TRANSFERABLE_KEYS).toEqual([
      "ohmywind_custom_spots",
      "ow_polar_config_v1",
      "ow_model_config_v1",
      "ow_lang",
      "ow_theme",
      "ow_tz",
      "ow_compare_v1",
      "ow_seamarks_explore_v1",
      "ow_seamarks_plan_v1",
      "ow_last_spot_v1",
      "ow_keep_awake",
      "ohmywind:onboarding-v1",
      "ow_compare_hint_v1",
      "ow_whats_new_seen_v1",
      "ow_drawer_vh_v1",
      "ow_sidebar_px_v1",
    ]);
    const skipped = Object.values(LOCAL_STORAGE_KEYS).filter((k) => !TRANSFERABLE_KEYS.includes(k));
    expect(skipped.sort()).toEqual(
      [
        "ow_geoloc_declined_v1",
        "ow_install_invite_v1",
        "ow_last_simulation_v1",
        "ow_last_view_v1",
        "ow_marc_coverage_v1",
        "ow_native_backup_v1",
        "ow_review_prompt_v1",
        "ow_shell_import_v1",
        "ow_waypoint_depths_v1",
      ].sort(),
    );
  });

  it("gives each transferred key its own rank", () => {
    const ranks = Object.values(TRANSFER_POLICY).flatMap((d) => (d.transfer ? [d.rank] : []));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("never transfers sessionStorage", () => {
    for (const key of Object.values(SESSION_STORAGE_KEYS)) expect(TRANSFERABLE_KEYS).not.toContain(key);
  });
});

describe("collectTransferableItems", () => {
  it("keeps transferable keys only, most precious first", () => {
    const items = collectTransferableItems(
      fakeStorage({
        [LOCAL_STORAGE_KEYS.theme]: "dark",
        [LOCAL_STORAGE_KEYS.lastSimulation]: "{\"big\":true}",
        [LOCAL_STORAGE_KEYS.geolocDeclined]: "1",
        [LOCAL_STORAGE_KEYS.marcCoverage]: "{}",
        [LOCAL_STORAGE_KEYS.customSpots]: "[]",
        unrelated: "x",
      }),
    );
    expect(items).toEqual({ ohmywind_custom_spots: "[]", ow_theme: "dark" });
    expect(Object.keys(items)).toEqual(["ohmywind_custom_spots", "ow_theme"]);
  });

  it("reads a legacy key under its current name when the current one is absent", () => {
    const items = collectTransferableItems(
      fakeStorage({
        [LEGACY_STORAGE_KEYS.customSpots]: "[1]",
        [LEGACY_STORAGE_KEYS.onboarding]: "done",
      }),
    );
    expect(items).toEqual({ ohmywind_custom_spots: "[1]", "ohmywind:onboarding-v1": "done" });
    expect(Object.keys(items)).not.toContain(LEGACY_STORAGE_KEYS.customSpots);
  });

  it("prefers the current name when both exist", () => {
    const items = collectTransferableItems(
      fakeStorage({
        [LEGACY_STORAGE_KEYS.customSpots]: "[\"old\"]",
        [LOCAL_STORAGE_KEYS.customSpots]: "[\"new\"]",
      }),
    );
    expect(items[LOCAL_STORAGE_KEYS.customSpots]).toBe("[\"new\"]");
  });

  it("survives a storage that throws", () => {
    const items = collectTransferableItems({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(items).toEqual({});
  });
});

describe("payload codec", () => {
  it("round-trips, accents and emoji included, in URL-safe characters", () => {
    const items = {
      ohmywind_custom_spots: JSON.stringify([{ name: "Île de Ré ⛵", lat: 46.2, lon: -1.4 }]),
      ow_lang: "fr",
    };
    const encoded = encodePayload(items);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePayload(encoded)).toEqual({ items });
  });

  it("encodes an empty set too", () => {
    expect(decodePayload(encodePayload({}))).toEqual({ items: {} });
  });

  it("rejects what is not base64url", () => {
    expect(() => decodePayload("a+b/")).toThrow();
    expect(() => decodePayload("a")).toThrow();
  });
});

describe("fitPayload", () => {
  it("keeps everything when it fits", () => {
    const items = { ow_theme: "dark", ohmywind_custom_spots: "[]" };
    const { encoded, kept, dropped } = fitPayload(items);
    expect(kept).toEqual(items);
    expect(dropped).toEqual([]);
    expect(decodePayload(encoded)).toEqual({ items: kept });
  });

  it("drops the least precious keys first, spots and boat last", () => {
    const filler = "x".repeat(20_000);
    const items = {
      ohmywind_custom_spots: filler,
      ow_polar_config_v1: filler,
      ow_model_config_v1: filler,
      ow_sidebar_px_v1: filler,
      ow_drawer_vh_v1: filler,
    };
    const { encoded, kept, dropped } = fitPayload(items);
    expect(encoded.length).toBeLessThanOrEqual(MAX_PAYLOAD_LENGTH);
    expect(Object.keys(kept)).toEqual(["ohmywind_custom_spots", "ow_polar_config_v1"]);
    expect(dropped).toEqual(["ow_model_config_v1", "ow_drawer_vh_v1", "ow_sidebar_px_v1"]);
  });

  it("lets one oversized entry cost only itself", () => {
    const { kept, dropped } = fitPayload({
      ohmywind_custom_spots: "x".repeat(MAX_PAYLOAD_LENGTH),
      ow_theme: "dark",
    });
    expect(kept).toEqual({ ow_theme: "dark" });
    expect(dropped).toEqual(["ohmywind_custom_spots"]);
  });

  it("honours a smaller ceiling", () => {
    const { encoded } = fitPayload({ ow_theme: "dark", ow_lang: "fr" }, 40);
    expect(encoded.length).toBeLessThanOrEqual(40);
  });
});

describe("readIncomingItems", () => {
  it("keeps known keys with string values, ignores the rest", () => {
    const encoded = encodePayload({
      ow_theme: "dark",
      ow_last_simulation_v1: "{}",
      ow_shell_import_v1: "{\"state\":\"done\"}",
      evil_key: "x",
    });
    expect(readIncomingItems(encoded)).toEqual({ ow_theme: "dark" });
  });

  it("drops a non-string value and a prototype key", () => {
    const raw = '{"items":{"ow_theme":3,"__proto__":{"polluted":"1"},"ow_lang":"en"}}';
    const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const items = readIncomingItems(encoded);
    expect(items).toEqual({ ow_lang: "en" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects malformed or oversized payloads as a whole", () => {
    expect(readIncomingItems("%%%")).toBeNull();
    expect(readIncomingItems(btoa("not json"))).toBeNull();
    expect(readIncomingItems(btoa(JSON.stringify({ items: [] })).replace(/=+$/, ""))).toBeNull();
    expect(readIncomingItems(btoa(JSON.stringify(["x"])).replace(/=+$/, ""))).toBeNull();
    expect(readIncomingItems("A".repeat(MAX_PAYLOAD_LENGTH + 1))).toBeNull();
  });

  it("accepts an empty set", () => {
    expect(readIncomingItems(encodePayload({}))).toEqual({});
  });
});
