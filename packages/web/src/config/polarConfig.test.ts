import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_POLARS,
  COEFF_DEFAULT,
  DEFAULT_BASE,
  SERVER_DEFAULT_EFFICIENCY,
  SPI_MAX_TWS_DEFAULT,
  defaultPolarConfig,
  derivedMinUpwind,
  effectiveMinUpwind,
  effectivePolar,
  initialPlanBoat,
  isImportedActive,
  isPersoActive,
  isPolarCustomized,
  loadPolarConfig,
  planEfficiency,
  polarFingerprint,
  savePolarConfig,
  spiBoostAt,
  type ImportedPolar,
  type PolarConfig,
} from "./polarConfig";

// Mirrors the module-private STORAGE_KEY — needed to seed raw payloads.
const STORAGE_KEY = "ow_polar_config_v1";

const IMPORTED: ImportedPolar = {
  name: "mon-bateau",
  tws_kn: [8, 12, 16],
  twa_deg: [45, 90, 135],
  boat_speed_kn: [
    [3.5, 4.2, 3.9],
    [4.4, 5.3, 5.0],
    [5.0, 6.1, 5.8],
  ],
};

// A qtVlm-style import carrying a 0° row of zeros (transposed: zero column).
const IMPORTED_ZERO_COL: ImportedPolar = {
  name: "avec-ligne-zero",
  tws_kn: [8, 12],
  twa_deg: [0, 40, 90],
  boat_speed_kn: [
    [0, 3.5, 4.2],
    [0, 4.4, 5.3],
  ],
};

function withImported(over: Partial<PolarConfig> = {}): PolarConfig {
  return { ...defaultPolarConfig(), imported: IMPORTED, source: "imported", ...over };
}

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaults", () => {
  it("starts on the archetype source at the default coefficient", () => {
    const cfg = defaultPolarConfig();
    expect(cfg.source).toBe("archetype");
    expect(cfg.imported).toBeNull();
    expect(cfg.coefficient).toBe(COEFF_DEFAULT);
    expect(cfg.spiMaxTwsKn).toBe(SPI_MAX_TWS_DEFAULT);
    expect(cfg.minUpwindDeg).toBeUndefined();
    expect(isImportedActive(cfg)).toBe(false);
    expect(planEfficiency(cfg)).toBe(COEFF_DEFAULT);
  });
});

describe("persistence", () => {
  it("round-trips a v3 config", () => {
    const cfg = withImported({ coefficient: 0.92, minUpwindDeg: 50, spiMaxTwsKn: 14 });
    savePolarConfig(cfg);
    const loaded = loadPolarConfig();
    expect(loaded.source).toBe("imported");
    expect(loaded.coefficient).toBe(0.92);
    expect(loaded.minUpwindDeg).toBe(50);
    expect(loaded.spiMaxTwsKn).toBe(14);
    expect(loaded.imported).toEqual(IMPORTED);
  });

  it("migrates a v1 payload: scale dropped, coefficient at the old server default", () => {
    store[STORAGE_KEY] = JSON.stringify({
      v: 1,
      base: "cruiser_40ft",
      scale: 1.2,
      spi: "asymmetric",
      overrides: { "0,0": 5 },
    });
    const loaded = loadPolarConfig();
    expect(loaded.base).toBe("cruiser_40ft");
    expect(loaded.coefficient).toBe(SERVER_DEFAULT_EFFICIENCY);
    expect(loaded.spi).toBe("asymmetric");
    expect(loaded.spiMaxTwsKn).toBe(SPI_MAX_TWS_DEFAULT);
    expect(loaded.minUpwindDeg).toBeUndefined();
    expect("scale" in loaded).toBe(false);
  });

  it("migrates v2 imported+applyEfficiency=false to coefficient 1.0", () => {
    store[STORAGE_KEY] = JSON.stringify({
      v: 2,
      base: DEFAULT_BASE,
      scale: 1,
      spi: "off",
      overrides: {},
      source: "imported",
      imported: IMPORTED,
      applyEfficiency: false,
    });
    expect(loadPolarConfig().coefficient).toBe(1.0);
  });

  it("migrates v2 applyEfficiency=false WITHOUT active import to the old default", () => {
    // The old flag only had an effect while the imported polar was active.
    store[STORAGE_KEY] = JSON.stringify({
      v: 2,
      base: DEFAULT_BASE,
      scale: 1,
      spi: "off",
      overrides: {},
      source: "archetype",
      imported: null,
      applyEfficiency: false,
    });
    expect(loadPolarConfig().coefficient).toBe(SERVER_DEFAULT_EFFICIENCY);
  });

  it("clamps out-of-range v3 fields back to sane values", () => {
    store[STORAGE_KEY] = JSON.stringify({
      v: 3,
      base: DEFAULT_BASE,
      coefficient: 7,
      spiMaxTwsKn: 200,
      minUpwindDeg: 5,
      spi: "off",
      overrides: {},
    });
    const loaded = loadPolarConfig();
    expect(loaded.coefficient).toBe(1.0);
    expect(loaded.spiMaxTwsKn).toBe(30);
    expect(loaded.minUpwindDeg).toBeUndefined();
  });

  it("drops a corrupted imported polar and snaps the source back", () => {
    const bad = {
      ...withImported(),
      imported: { ...IMPORTED, boat_speed_kn: [[1, 2]] }, // wrong dims
    };
    savePolarConfig(bad);
    const loaded = loadPolarConfig();
    expect(loaded.imported).toBeNull();
    expect(loaded.source).toBe("archetype");
  });

  it("rejects a persisted imported polar with a non-ascending grid", () => {
    const bad = {
      ...withImported(),
      imported: { ...IMPORTED, tws_kn: [8, 8, 16] },
    };
    savePolarConfig(bad);
    expect(loadPolarConfig().imported).toBeNull();
  });

  it("round-trips a parked perso (persoActive: false)", () => {
    savePolarConfig(withImported({ persoActive: false }));
    expect(loadPolarConfig().persoActive).toBe(false);
  });

  it("defaults persoActive to true on configs persisted before the field", () => {
    store[STORAGE_KEY] = JSON.stringify({
      v: 3,
      base: DEFAULT_BASE,
      spi: "asymmetric",
      overrides: {},
    });
    expect(loadPolarConfig().persoActive).toBe(true);
  });
});

describe("effectivePolar", () => {
  it("returns the imported matrix verbatim when active and spi is off", () => {
    const eff = effectivePolar(withImported());
    expect(eff.name).toBe("mon-bateau");
    expect(eff.tws_kn).toEqual(IMPORTED.tws_kn);
    expect(eff.twa_deg).toEqual(IMPORTED.twa_deg);
    expect(eff.boat_speed_kn).toEqual(IMPORTED.boat_speed_kn);
  });

  it("keeps the archetype matrix when the source is archetype", () => {
    const cfg = withImported({ source: "archetype" });
    const eff = effectivePolar(cfg);
    expect(eff.name).toBe(DEFAULT_BASE);
    expect(eff.boat_speed_kn).toEqual(BASE_POLARS[DEFAULT_BASE].boat_speed_kn);
  });

  it("always carries the effective min upwind angle", () => {
    // Archetype: the bundled JSON value; imported: derived from the grid.
    expect(effectivePolar(defaultPolarConfig()).min_upwind_twa_deg).toBe(
      BASE_POLARS[DEFAULT_BASE].min_upwind_twa_deg,
    );
    expect(effectivePolar(withImported()).min_upwind_twa_deg).toBe(45);
    expect(effectivePolar(withImported({ minUpwindDeg: 52 })).min_upwind_twa_deg).toBe(52);
  });

  it("gates the spi boost above spiMaxTwsKn", () => {
    const cfg: PolarConfig = { ...defaultPolarConfig(), spi: "asymmetric" };
    const base = BASE_POLARS[DEFAULT_BASE];
    const eff = effectivePolar(cfg);
    const twa90 = base.twa_deg.indexOf(90);
    const tws16 = base.tws_kn.indexOf(16);
    const tws20 = base.tws_kn.indexOf(20);
    // 16 kn is at the default ceiling → boosted ×1.1; 20 kn is above → bare.
    expect(eff.boat_speed_kn[tws16][twa90]).toBeCloseTo(
      Math.round(base.boat_speed_kn[tws16][twa90] * 1.1 * 10) / 10,
    );
    expect(eff.boat_speed_kn[tws20][twa90]).toBe(base.boat_speed_kn[tws20][twa90]);
  });

  it("never applies the spi boost to an imported polar", () => {
    // The file is presumed to already include the boat's sail inventory; a
    // stale spi selection from archetype mode must not double-count it.
    const eff = effectivePolar(withImported({ spi: "asymmetric" }));
    expect(eff.boat_speed_kn).toEqual(IMPORTED.boat_speed_kn);
  });

  it("propagates the motor config onto the imported polar only when complete", () => {
    const full = effectivePolar(withImported({ motorThresholdKn: 2, motorSpeedKn: 5 }));
    expect(full.motor_threshold_kn).toBe(2);
    expect(full.motor_speed_kn).toBe(5);
    const half = effectivePolar(withImported({ motorThresholdKn: 2 }));
    expect(half.motor_threshold_kn).toBeUndefined();
    expect(half.motor_speed_kn).toBeUndefined();
  });
});

describe("spiBoostAt", () => {
  it("matches the map exactly on archetype breakpoints", () => {
    expect(spiBoostAt("asymmetric", 110)).toBe(1.2);
    expect(spiBoostAt("symmetric", 150)).toBe(1.25);
    expect(spiBoostAt("off", 110)).toBe(1);
  });

  it("interpolates between breakpoints and clamps at the edges", () => {
    // 100° is halfway between 90 (×1.1) and 110 (×1.2) on the asymmetric map.
    expect(spiBoostAt("asymmetric", 100)).toBeCloseTo(1.15);
    expect(spiBoostAt("asymmetric", 30)).toBe(1.0);
    expect(spiBoostAt("symmetric", 180)).toBe(1.22);
  });
});

describe("min upwind derivation", () => {
  it("derives the first angle carrying real speeds", () => {
    expect(derivedMinUpwind(IMPORTED)).toBe(45);
  });

  it("honours a file with a genuine 30° entry end-to-end", () => {
    // A performance polar carrying real speeds at 30° must not be clipped to
    // the archetype defaults: the derived floor is 30 and the payload carries
    // it, so the server sweeps VMG from 30° on genuine data.
    const perf: ImportedPolar = {
      name: "perf-30",
      tws_kn: [8, 12],
      twa_deg: [30, 40, 90],
      boat_speed_kn: [
        [2.8, 3.6, 4.4],
        [3.4, 4.5, 5.6],
      ],
    };
    const cfg = withImported({ imported: perf });
    expect(derivedMinUpwind(perf)).toBe(30);
    expect(effectivePolar(cfg).min_upwind_twa_deg).toBe(30);
  });

  it("skips a leading zero column (0° row of zeros)", () => {
    expect(derivedMinUpwind(IMPORTED_ZERO_COL)).toBe(40);
    const cfg = withImported({ imported: IMPORTED_ZERO_COL });
    expect(effectiveMinUpwind(cfg)).toBe(40);
  });

  it("prefers the user override, then the archetype JSON value", () => {
    expect(effectiveMinUpwind(defaultPolarConfig())).toBe(
      BASE_POLARS[DEFAULT_BASE].min_upwind_twa_deg,
    );
    expect(effectiveMinUpwind({ ...defaultPolarConfig(), minUpwindDeg: 38 })).toBe(38);
  });

  it("follows the archetype passed as override", () => {
    expect(effectiveMinUpwind(defaultPolarConfig(), "catamaran_40ft")).toBe(
      BASE_POLARS.catamaran_40ft.min_upwind_twa_deg,
    );
  });
});

describe("isPolarCustomized", () => {
  it("is false for the untouched default against its own archetype", () => {
    expect(isPolarCustomized(defaultPolarConfig())).toBe(false);
  });

  it("stays false when only the coefficient moves (it travels as efficiency)", () => {
    expect(isPolarCustomized({ ...defaultPolarConfig(), coefficient: 1.0 })).toBe(
      false,
    );
  });

  it("is true when the upwind angle is pinned", () => {
    expect(isPolarCustomized({ ...defaultPolarConfig(), minUpwindDeg: 50 })).toBe(
      true,
    );
  });

  it("is true whenever the imported polar is active", () => {
    expect(isPolarCustomized(withImported())).toBe(true);
  });

  it("ignores a stored-but-inactive imported polar", () => {
    expect(isPolarCustomized(withImported({ source: "archetype" }))).toBe(false);
  });

  it("does not treat a base/archetype mismatch alone as customization", () => {
    // A shared URL can carry another boat: its archetype wins server-side,
    // no matrix push needed.
    expect(isPolarCustomized(defaultPolarConfig())).toBe(false);
  });

  it("applies spi/overrides onto an explicitly requested boat grid", () => {
    const cfg: PolarConfig = { ...defaultPolarConfig(), spi: "asymmetric" };
    const eff = effectivePolar(cfg, "cruiser_50ft");
    expect(eff.name).toBe("cruiser_50ft");
    expect(eff.min_upwind_twa_deg).toBe(BASE_POLARS.cruiser_50ft.min_upwind_twa_deg);
  });
});

describe("isPersoActive", () => {
  it("is false while nothing is customized, whatever the flag says", () => {
    expect(isPersoActive(defaultPolarConfig())).toBe(false);
    expect(isPersoActive({ ...defaultPolarConfig(), persoActive: false })).toBe(false);
  });

  it("is true for a fresh customization (flag defaults to true)", () => {
    expect(isPersoActive({ ...defaultPolarConfig(), spi: "asymmetric" })).toBe(true);
    expect(isPersoActive(withImported())).toBe(true);
  });

  it("is false once the perso polar is parked for a stock archetype", () => {
    expect(
      isPersoActive({ ...defaultPolarConfig(), spi: "asymmetric", persoActive: false }),
    ).toBe(false);
  });
});

describe("initialPlanBoat", () => {
  const custom50: PolarConfig = {
    ...defaultPolarConfig(),
    base: "cruiser_50ft",
    spi: "asymmetric",
  };

  it("pins the boat to cfg.base when a customization is active (#220)", () => {
    // The reported repro: custom polar built on a 50-footer, URL/cache still
    // carrying the 30ft slug from an earlier session.
    expect(initialPlanBoat(custom50, "cruiser_30ft", null)).toBe("cruiser_50ft");
    expect(initialPlanBoat(custom50, null, "cruiser_30ft")).toBe("cruiser_50ft");
  });

  it("lets the URL's boat win again once the perso polar is parked", () => {
    const parked = { ...custom50, persoActive: false };
    expect(initialPlanBoat(parked, "cruiser_30ft", null)).toBe("cruiser_30ft");
    expect(initialPlanBoat(parked, null, "cruiser_25ft")).toBe("cruiser_25ft");
    expect(initialPlanBoat(parked, null, null)).toBe("cruiser_50ft");
  });

  it("pins to cfg.base for an active imported polar too", () => {
    expect(initialPlanBoat(withImported({ base: "cruiser_40ft" }), "cruiser_30ft", null)).toBe(
      "cruiser_40ft",
    );
  });

  it("lets the URL's boat win when nothing is customized", () => {
    expect(initialPlanBoat(defaultPolarConfig(), "cruiser_50ft", "cruiser_25ft")).toBe(
      "cruiser_50ft",
    );
  });

  it("falls back to the cached slug, then cfg.base", () => {
    expect(initialPlanBoat(defaultPolarConfig(), null, "cruiser_25ft")).toBe("cruiser_25ft");
    expect(initialPlanBoat(defaultPolarConfig(), null, null)).toBe(DEFAULT_BASE);
  });
});

describe("planEfficiency", () => {
  it("returns the coefficient unconditionally", () => {
    expect(planEfficiency(defaultPolarConfig())).toBe(COEFF_DEFAULT);
    expect(planEfficiency(withImported({ coefficient: 1.0 }))).toBe(1.0);
  });
});

describe("polarFingerprint", () => {
  it("distinguishes imported from archetype", () => {
    expect(polarFingerprint(withImported())).not.toBe(polarFingerprint(defaultPolarConfig()));
  });

  it.each([
    ["coefficient", { coefficient: 0.9 }],
    ["spi", { spi: "asymmetric" as const }],
    ["spiMaxTwsKn", { spi: "asymmetric" as const, spiMaxTwsKn: 12 }],
    ["minUpwindDeg", { minUpwindDeg: 50 }],
  ])("changes when %s changes", (_label, over) => {
    expect(polarFingerprint({ ...defaultPolarConfig(), ...over })).not.toBe(
      polarFingerprint(defaultPolarConfig()),
    );
  });

  it("changes when a single matrix cell changes", () => {
    const tweaked = withImported({
      imported: {
        ...IMPORTED,
        boat_speed_kn: IMPORTED.boat_speed_kn.map((row, i) =>
          i === 0 ? [9.9, ...row.slice(1)] : row,
        ),
      },
    });
    expect(polarFingerprint(tweaked)).not.toBe(polarFingerprint(withImported()));
  });

  it("is stable for identical configs", () => {
    expect(polarFingerprint(withImported())).toBe(polarFingerprint(withImported()));
  });

  it("changes when the perso polar is parked (matrix push flips off)", () => {
    expect(polarFingerprint(withImported({ persoActive: false }))).not.toBe(
      polarFingerprint(withImported()),
    );
  });
});
