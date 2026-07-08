// Shared number/duration formatters for the /plan panel. Consolidates helpers
// that had drifted into separate copies across PlanStates.tsx and
// WindowsTable.tsx so the "12h30" convention and French decimals stay in one
// tested place.

/**
 * Duration in decimal hours to the compact "12h30" convention.
 * - whole hours drop the minutes: 3 → "3h"
 * - sub-hour durations show only minutes: 0.5 → "30m"
 * - otherwise minutes are zero-padded: 12.5 → "12h30"
 */
export function fmtDuration(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, "0")}`;
}

/**
 * Defensive wrapper: a HF Space deployment lag may serve a response missing a
 * duration field. Prefer a graceful "—" over rendering "NaNh".
 */
export function fmtDurationSafe(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  return fmtDuration(h);
}

/** One-decimal French number: 38.2 → "38,2". Matches sailing-French copy. */
export function fr1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
