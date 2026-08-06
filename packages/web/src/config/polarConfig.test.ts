import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_POLARS,
  DEFAULT_BASE,
  defaultPolarConfig,
  effectivePolar,
  isImportedActive,
  isPolarCustomized,
  loadPolarConfig,
  planEfficiency,
  polarFingerprint,
  savePolarConfig,
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
  it("starts on the archetype source with the coefficient applied", () => {
    const cfg = defaultPolarConfig();
    expect(cfg.source).toBe("archetype");
    expect(cfg.imported).toBeNull();
    expect(cfg.applyEfficiency).toBe(true);
    expect(isImportedActive(cfg)).toBe(false);
    expect(planEfficiency(cfg)).toBeUndefined();
  });
});

describe("persistence", () => {
  it("round-trips an imported polar with the coefficient switched off", () => {
    const cfg = withImported({ applyEfficiency: false });
    savePolarConfig(cfg);
    const loaded = loadPolarConfig();
    expect(loaded.source).toBe("imported");
    expect(loaded.applyEfficiency).toBe(false);
    expect(loaded.imported).toEqual(IMPORTED);
  });

  it("loads a v1 payload with defaults for the v2 fields", () => {
    store[STORAGE_KEY] = JSON.stringify({
      v: 1,
      base: "cruiser_40ft",
      scale: 1.2,
      spi: "asymmetric",
      overrides: { "0,0": 5 },
    });
    const loaded = loadPolarConfig();
    expect(loaded.base).toBe("cruiser_40ft");
    expect(loaded.scale).toBe(1.2);
    expect(loaded.source).toBe("archetype");
    expect(loaded.imported).toBeNull();
    expect(loaded.applyEfficiency).toBe(true);
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
});

describe("effectivePolar", () => {
  it("returns the imported matrix verbatim when active", () => {
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

  it("propagates the motor config onto the imported polar only when complete", () => {
    const full = effectivePolar(withImported({ motorThresholdKn: 2, motorSpeedKn: 5 }));
    expect(full.motor_threshold_kn).toBe(2);
    expect(full.motor_speed_kn).toBe(5);
    const half = effectivePolar(withImported({ motorThresholdKn: 2 }));
    expect(half.motor_threshold_kn).toBeUndefined();
    expect(half.motor_speed_kn).toBeUndefined();
  });
});

describe("isPolarCustomized", () => {
  it("is false for the untouched default against its own archetype", () => {
    expect(isPolarCustomized(defaultPolarConfig(), DEFAULT_BASE)).toBe(false);
  });

  it("is true whenever the imported polar is active", () => {
    expect(isPolarCustomized(withImported(), DEFAULT_BASE)).toBe(true);
  });

  it("ignores a stored-but-inactive imported polar", () => {
    expect(isPolarCustomized(withImported({ source: "archetype" }), DEFAULT_BASE)).toBe(false);
  });
});

describe("planEfficiency", () => {
  it("pins 1.0 when the imported polar is active and the coefficient is off", () => {
    expect(planEfficiency(withImported({ applyEfficiency: false }))).toBe(1.0);
  });

  it("keeps the server default when the coefficient stays on", () => {
    expect(planEfficiency(withImported())).toBeUndefined();
  });

  it("ignores the flag while planning on the archetype", () => {
    const cfg = withImported({ source: "archetype", applyEfficiency: false });
    expect(planEfficiency(cfg)).toBeUndefined();
  });
});

describe("polarFingerprint", () => {
  it("distinguishes imported from archetype", () => {
    expect(polarFingerprint(withImported())).not.toBe(polarFingerprint(defaultPolarConfig()));
  });

  it("changes when the coefficient toggle flips", () => {
    expect(polarFingerprint(withImported())).not.toBe(
      polarFingerprint(withImported({ applyEfficiency: false })),
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
});
