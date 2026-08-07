// Geometry helper for PolarDiagram, in its own module so the component file
// only exports components (react-refresh constraint) and tests can import it
// without touching React.

// The curve points actually drawn for one TWS row: everything below the
// minimum upwind angle is dropped, and when the grid crosses the boundary the
// entry point is interpolated exactly onto it so the curve starts on the
// no-go edge rather than jumping to the next grid angle.
export function visiblePolarPoints(
  twaDeg: number[],
  speeds: number[],
  minUpwindDeg: number,
): { twa: number; speed: number }[] {
  const pts = twaDeg.map((twa, i) => ({ twa, speed: speeds[i] }));
  const first = pts.findIndex((p) => p.twa >= minUpwindDeg);
  if (first === -1) return [];
  if (first === 0) return pts;
  const kept = pts.slice(first);
  if (kept[0].twa === minUpwindDeg) return kept;
  const below = pts[first - 1];
  const above = kept[0];
  const f = (minUpwindDeg - below.twa) / (above.twa - below.twa);
  const speed = Math.round((below.speed + f * (above.speed - below.speed)) * 100) / 100;
  return [{ twa: minUpwindDeg, speed }, ...kept];
}
