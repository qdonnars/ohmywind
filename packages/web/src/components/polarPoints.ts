// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Geometry helper for PolarDiagram, in its own module so the component file
// only exports components (react-refresh constraint) and tests can import it
// without touching React.

// The curve points actually drawn for one TWS row: everything below the
// minimum upwind angle is dropped, and the curve enters exactly on the no-go
// boundary. The entry speed comes from real data when it exists on both sides
// (linear interpolation); when the boundary sits below the first real angle —
// user pinning tighter than the file's data, or a dead 0-kn row — the curve
// is extended along the equal-VMG arc instead: pinching below the data can't
// beat the polar's VMG, so speed tapers by cos(θ0)/cos(θ). This mirrors the
// server, whose VMG sweep never searches below the grid's real data.
//
// The downwind edge gets the mirror treatment: grids usually stop short of a
// dead run (165° on the bundled archetypes) while the planner's polar lookup
// clamps flat past the last angle — a 180° leg sails at the last column's
// speed. The drawn curve is extended the same way so the diagram shows what
// the planner will actually use.

function withDeadRun(pts: { twa: number; speed: number }[]): { twa: number; speed: number }[] {
  const last = pts[pts.length - 1];
  return last.twa >= 180 ? pts : [...pts, { twa: 180, speed: last.speed }];
}

export function visiblePolarPoints(
  twaDeg: number[],
  speeds: number[],
  minUpwindDeg: number,
): { twa: number; speed: number }[] {
  const pts = twaDeg.map((twa, i) => ({ twa, speed: speeds[i] }));
  const first = pts.findIndex((p) => p.twa >= minUpwindDeg);
  if (first === -1) return [];
  const kept = pts.slice(first);
  if (kept[0].twa === minUpwindDeg) return withDeadRun(kept);
  // Past 90° an equal-VMG extension is meaningless (cos ≤ 0) and such a grid
  // has no upwind data anyway — draw what exists.
  if (kept[0].twa >= 90) return withDeadRun(kept);
  const below = first > 0 ? pts[first - 1] : null;
  let speed: number;
  if (below && below.speed > 0.1) {
    const f = (minUpwindDeg - below.twa) / (kept[0].twa - below.twa);
    speed = below.speed + f * (kept[0].speed - below.speed);
  } else {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    speed = (kept[0].speed * Math.cos(rad(kept[0].twa))) / Math.cos(rad(minUpwindDeg));
  }
  return withDeadRun([{ twa: minUpwindDeg, speed: Math.round(speed * 100) / 100 }, ...kept]);
}
