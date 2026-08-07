// Parser for user-supplied polar files (qtVlm / Expedition / MaxSea layout):
// first line lists the TWS columns (optionally prefixed by a "TWA\TWS"-style
// label), each following line is a TWA row followed by one boat speed per TWS.
// Separators: tab, semicolon, comma or whitespace — auto-detected. Decimal
// commas ("5,2") are tolerated when the separator is not the comma itself,
// because French spreadsheet exports commonly combine ";" with decimal commas.
//
// The parsed grid is transposed into the app's internal orientation
// (boat_speed_kn[tws_idx][twa_idx]) and validated against the same rules the
// server's `_parse_polar` enforces, so a file accepted here is never rejected
// at plan time.

export interface ParsedPolarFile {
  tws_kn: number[];
  twa_deg: number[];
  // [tws_idx][twa_idx] -> boat speed in knots.
  boat_speed_kn: number[][];
  // Non-fatal adjustments applied during parsing, for display to the user.
  warnings: string[];
}

export class PolarImportError extends Error {}

// Grid caps — far above any real polar file (typically ≤ 30 TWS × 40 TWA),
// they only guard against pathological inputs producing megabyte payloads.
const MAX_TWS = 60;
const MAX_TWA = 181;
// Server-side `_parse_polar` rejects speeds outside [0, 30]; values above are
// clamped here (with a warning) rather than rejected so a single optimistic
// cell doesn't block a whole import.
const SPEED_MAX = 30;
const TWS_MAX = 100;

function splitLine(line: string, delimiter: RegExp, decimalComma: boolean): string[] {
  const cells = line.split(delimiter).map((c) => c.trim()).filter((c) => c.length > 0);
  if (!decimalComma) return cells;
  return cells.map((c) => c.replace(",", "."));
}

function parseNumber(token: string): number | null {
  if (!/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

export function parsePolarFile(text: string): ParsedPolarFile {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l, i) => ({ raw: l.trim(), lineNo: i + 1 }))
    .filter((l) => l.raw.length > 0 && !l.raw.startsWith("#") && !l.raw.startsWith("//"));

  if (lines.length === 0) {
    throw new PolarImportError("Fichier vide : aucune ligne de données trouvée.");
  }

  // Delimiter detection on the whole content, by priority. Whole-file (not
  // per-line) so a stray comma in a tab-separated file doesn't flip modes.
  const body = lines.map((l) => l.raw).join("\n");
  let delimiter: RegExp;
  let decimalComma: boolean;
  if (body.includes("\t")) {
    delimiter = /\t/;
    decimalComma = true;
  } else if (body.includes(";")) {
    delimiter = /;/;
    decimalComma = true;
  } else if (body.includes(",")) {
    delimiter = /,/;
    decimalComma = false;
  } else {
    delimiter = /\s+/;
    decimalComma = false;
  }

  const rows = lines.map((l) => ({
    cells: splitLine(l.raw, delimiter, decimalComma),
    lineNo: l.lineNo,
  }));

  // Header row: TWS columns, optionally preceded by a "TWA\TWS" label cell.
  const header = rows[0];
  const headerFirstIsNumber = parseNumber(header.cells[0]) !== null;
  let twsCells: string[];
  if (!headerFirstIsNumber) {
    twsCells = header.cells.slice(1);
  } else {
    // No label cell. Only unambiguous when every data row carries one extra
    // cell (its TWA) compared to the header.
    const dataRows = rows.slice(1);
    const allOneLonger =
      dataRows.length > 0 && dataRows.every((r) => r.cells.length === header.cells.length + 1);
    if (!allOneLonger) {
      throw new PolarImportError(
        "Première ligne illisible : elle doit lister les vitesses de vent (TWS), " +
          'par exemple "TWA\\TWS  6  8  10  12  16  20".',
      );
    }
    twsCells = header.cells;
  }

  const tws = twsCells.map((c) => {
    const n = parseNumber(c);
    if (n === null || n < 0 || n > TWS_MAX) {
      throw new PolarImportError(
        `Ligne ${header.lineNo} : TWS invalide « ${c} » (attendu un nombre entre 0 et ${TWS_MAX} kn).`,
      );
    }
    return n;
  });
  if (tws.length < 2) {
    throw new PolarImportError("Il faut au moins 2 colonnes de vent (TWS) dans le fichier.");
  }
  if (tws.length > MAX_TWS) {
    throw new PolarImportError(`Trop de colonnes TWS (${tws.length}, maximum ${MAX_TWS}).`);
  }

  interface TwaRow {
    twa: number;
    speeds: number[];
    lineNo: number;
  }
  const twaRows: TwaRow[] = [];
  let clampedCount = 0;
  for (const row of rows.slice(1)) {
    const twa = parseNumber(row.cells[0]);
    if (twa === null || twa < 0 || twa > 180) {
      throw new PolarImportError(
        `Ligne ${row.lineNo} : angle TWA invalide « ${row.cells[0]} » (attendu un nombre entre 0 et 180°).`,
      );
    }
    if (row.cells.length - 1 !== tws.length) {
      throw new PolarImportError(
        `Ligne ${row.lineNo} : ${row.cells.length - 1} vitesse(s) trouvée(s), ` +
          `${tws.length} attendue(s) (une par colonne TWS).`,
      );
    }
    const speeds = row.cells.slice(1).map((c) => {
      const n = parseNumber(c);
      if (n === null || n < 0) {
        throw new PolarImportError(
          `Ligne ${row.lineNo} : vitesse bateau invalide « ${c} » (attendu un nombre ≥ 0).`,
        );
      }
      if (n > SPEED_MAX) {
        clampedCount += 1;
        return SPEED_MAX;
      }
      // Round away float noise while keeping file precision (0.01 kn).
      return Math.round(n * 100) / 100;
    });
    twaRows.push({ twa, speeds, lineNo: row.lineNo });
  }

  if (twaRows.length < 2) {
    throw new PolarImportError("Il faut au moins 2 lignes d'angles (TWA) dans le fichier.");
  }
  if (twaRows.length > MAX_TWA) {
    throw new PolarImportError(`Trop de lignes TWA (${twaRows.length}, maximum ${MAX_TWA}).`);
  }

  // Sort rows/columns rather than reject: files exported by hand are not
  // always ordered, and the server requires strictly ascending grids.
  const twsOrder = tws.map((_, i) => i).sort((a, b) => tws[a] - tws[b]);
  const sortedTws = twsOrder.map((i) => tws[i]);
  for (let i = 1; i < sortedTws.length; i++) {
    if (sortedTws[i] === sortedTws[i - 1]) {
      throw new PolarImportError(`Colonne TWS en double : ${sortedTws[i]} kn apparaît deux fois.`);
    }
  }
  twaRows.sort((a, b) => a.twa - b.twa);
  for (let i = 1; i < twaRows.length; i++) {
    if (twaRows[i].twa === twaRows[i - 1].twa) {
      throw new PolarImportError(
        `Ligne ${twaRows[i].lineNo} : angle TWA en double (${twaRows[i].twa}°).`,
      );
    }
  }

  // Transpose file rows (TWA-major) into the app's TWS-major matrix.
  const boat_speed_kn = sortedTws.map((_, twsIdx) =>
    twaRows.map((row) => row.speeds[twsOrder[twsIdx]]),
  );

  const warnings: string[] = [];
  if (clampedCount > 0) {
    warnings.push(
      `${clampedCount} vitesse(s) supérieure(s) à ${SPEED_MAX} kn ramenée(s) à ${SPEED_MAX} kn.`,
    );
  }

  return {
    tws_kn: sortedTws,
    twa_deg: twaRows.map((r) => r.twa),
    boat_speed_kn,
    warnings,
  };
}
