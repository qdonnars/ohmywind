// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import exampleCsv from "../../public/polars/exemple-polaire.csv?raw";
import { describe, expect, it } from "vitest";
import { parsePolarFile, PolarImportError } from "./polarImport";

// Minimal well-formed file: 3 TWS columns, 3 TWA rows, tab-separated.
const TAB_FILE = [
  "TWA\\TWS\t6\t10\t16",
  "45\t3.2\t4.8\t5.6",
  "90\t4.1\t5.9\t6.8",
  "150\t3.0\t5.1\t6.5",
].join("\n");

describe("parsePolarFile", () => {
  it("parses a standard tab-separated file with a TWA\\TWS label", () => {
    const p = parsePolarFile(TAB_FILE);
    expect(p.tws_kn).toEqual([6, 10, 16]);
    expect(p.twa_deg).toEqual([45, 90, 150]);
    expect(p.warnings).toEqual([]);
  });

  it("transposes file rows (TWA-major) into the TWS-major matrix", () => {
    const p = parsePolarFile(TAB_FILE);
    // boat_speed_kn[tws_idx][twa_idx]: column "10 kn" (idx 1), row "90°" (idx 1).
    expect(p.boat_speed_kn[1][1]).toBe(5.9);
    // Column "6 kn" over the three TWA rows.
    expect(p.boat_speed_kn[0]).toEqual([3.2, 4.1, 3.0]);
    // Column "16 kn" at TWA 150°.
    expect(p.boat_speed_kn[2][2]).toBe(6.5);
  });

  it("parses semicolon-separated files with French decimal commas", () => {
    const p = parsePolarFile(["twa/tws;8;12", "60;4,5;5,25", "120;5,1;6,0"].join("\n"));
    expect(p.tws_kn).toEqual([8, 12]);
    expect(p.boat_speed_kn[0][0]).toBe(4.5);
    expect(p.boat_speed_kn[1][0]).toBe(5.25);
  });

  it("parses comma-separated files with decimal points", () => {
    const p = parsePolarFile(["TWA,8,12", "60,4.5,5.2", "120,5.1,6.0"].join("\n"));
    expect(p.tws_kn).toEqual([8, 12]);
    expect(p.boat_speed_kn[1][1]).toBe(6.0);
  });

  it("parses whitespace-separated files without a header label", () => {
    // Header has 2 cells (TWS only), every data row has 3 — unambiguous.
    const p = parsePolarFile(["8 12", "60 4.5 5.2", "120 5.1 6.0"].join("\n"));
    expect(p.tws_kn).toEqual([8, 12]);
    expect(p.twa_deg).toEqual([60, 120]);
  });

  it("skips blank lines and comments", () => {
    const p = parsePolarFile(
      ["# exported by qtVlm", "", TAB_FILE, "", "// trailing note"].join("\n"),
    );
    expect(p.twa_deg).toEqual([45, 90, 150]);
  });

  it("handles CRLF line endings", () => {
    const p = parsePolarFile(TAB_FILE.replace(/\n/g, "\r\n"));
    expect(p.twa_deg).toEqual([45, 90, 150]);
  });

  it("sorts unsorted TWA rows and TWS columns", () => {
    const p = parsePolarFile(
      ["TWA\\TWS\t16\t6", "150\t6.5\t3.0", "45\t5.6\t3.2"].join("\n"),
    );
    expect(p.tws_kn).toEqual([6, 16]);
    expect(p.twa_deg).toEqual([45, 150]);
    // Cell (6 kn, 45°) came from the last row, second column of the file.
    expect(p.boat_speed_kn[0][0]).toBe(3.2);
    expect(p.boat_speed_kn[1][1]).toBe(6.5);
  });

  it("clamps speeds above 30 kn and reports a warning", () => {
    const p = parsePolarFile(["TWA\\TWS\t20\t25", "90\t31.5\t35", "120\t10\t12"].join("\n"));
    expect(p.boat_speed_kn[0][0]).toBe(30);
    expect(p.boat_speed_kn[1][0]).toBe(30);
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("2 vitesse(s)");
  });

  it("rejects an empty file", () => {
    expect(() => parsePolarFile("\n\n# only comments\n")).toThrow(PolarImportError);
  });

  it("rejects fewer than 2 TWS columns", () => {
    expect(() => parsePolarFile(["TWA\\TWS\t10", "45\t4", "90\t5"].join("\n"))).toThrow(
      /2 colonnes/,
    );
  });

  it("rejects fewer than 2 TWA rows", () => {
    expect(() => parsePolarFile(["TWA\\TWS\t6\t10", "90\t4\t5"].join("\n"))).toThrow(/2 lignes/);
  });

  it("rejects a row with the wrong number of speeds", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t10", "45\t3.2", "90\t4.1\t5.9"].join("\n")),
    ).toThrow(/Ligne 2/);
  });

  it("rejects TWA outside [0, 180]", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t10", "45\t3\t4", "190\t4\t5"].join("\n")),
    ).toThrow(/TWA invalide/);
  });

  it("rejects non-numeric speeds", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t10", "45\t3\tabc", "90\t4\t5"].join("\n")),
    ).toThrow(/vitesse bateau invalide/);
  });

  it("rejects negative speeds", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t10", "45\t3\t-1", "90\t4\t5"].join("\n")),
    ).toThrow(/vitesse bateau invalide/);
  });

  it("rejects duplicate TWA rows", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t10", "90\t3\t4", "90\t4\t5"].join("\n")),
    ).toThrow(/TWA en double/);
  });

  it("rejects duplicate TWS columns", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t10\t10", "45\t3\t4", "90\t4\t5"].join("\n")),
    ).toThrow(/TWS en double/);
  });

  it("rejects an unreadable header (numeric first cell, same-length rows)", () => {
    // First line looks like a data row: cannot tell TWS from TWA apart.
    expect(() =>
      parsePolarFile(["45\t3.2\t4.8", "90\t4.1\t5.9", "150\t3.0\t5.1"].join("\n")),
    ).toThrow(/Première ligne illisible/);
  });

  it("rejects invalid TWS values in the header", () => {
    expect(() =>
      parsePolarFile(["TWA\\TWS\t6\t900", "45\t3\t4", "90\t4\t5"].join("\n")),
    ).toThrow(/TWS invalide/);
  });
});

describe("bundled example file", () => {
  it("the downloadable example parses with the import parser", () => {
    // public/polars/exemple-polaire.csv is what we tell users to start from:
    // it must always satisfy the parser it is meant to demonstrate.
    const parsed = parsePolarFile(exampleCsv);
    expect(parsed.tws_kn).toEqual([6, 8, 10, 12, 14, 16, 20, 25]);
    expect(parsed.twa_deg).toEqual([40, 50, 60, 75, 90, 110, 135, 150, 165]);
    expect(parsed.warnings).toEqual([]);
    // Spot-check the transposition: TWS 10 kn (idx 2) at TWA 90° (idx 4).
    expect(parsed.boat_speed_kn[2][4]).toBe(6.0);
  });
});
