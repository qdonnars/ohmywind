// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * "Conditions vues du bateau": a North-up dial with the hull rotated to its
 * true heading, and every force at its absolute compass bearing.
 *
 * Wind and waves sit on the side they come FROM, the current arrows point
 * where the water sets TO. Each is the convention of its own data, and the
 * caption under the card says so (issue #269).
 *
 * The dial is drawn in a fixed 320-unit space and rendered at `size` pixels.
 * Geometry scales with the size; stroke widths and letters are corrected so
 * they stay legible at 140 px, where the panel now draws it beside the
 * numbers. Values are not labelled on the dial any more: the column next to
 * it carries them, in the same colours (`forceColors.ts`).
 *
 * `windArc` and `currentArc` shade the range of directions the steps of a
 * leg disagree over, around the mean arrow. A step shows no arc.
 */

import { FORCE_COLORS } from "./forceColors";

const SIZE = 320;
const CENTER = SIZE / 2;
const COMPASS_R = 104;
const ARROW_TAIL_R = 100;
const ARROW_TIP_R = 58;
const ARC_INNER_R = 42;

// 0° = up (12 o'clock), increasing clockwise. Returns [x, y] in dial units.
function polarXY(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + Math.cos(rad) * r, CENTER + Math.sin(rad) * r];
}

/** Sizes that must survive the scale-down: `px` is one screen pixel in dial
    units, `mid` a compromise for arrowheads and wave amplitude, which would
    turn to blobs at full pixel size and vanish at full scale. */
interface Metrics {
  px: number;
  mid: number;
}

// Double-shaft arrow for the wind: two parallel lines so the eye can pick it
// out among the wavy line and the current flow field. The shaft stops a few
// units short of the tip so the lines don't poke through the arrowhead.
function WindArrow({
  fromR,
  toR,
  angleDeg,
  color,
  m,
}: {
  fromR: number;
  toR: number;
  angleDeg: number;
  color: string;
  m: Metrics;
}) {
  const [x1, y1] = polarXY(angleDeg, fromR);
  const [x2, y2] = polarXY(angleDeg, toR);
  const dirRad = Math.atan2(y2 - y1, x2 - x1);
  const perpRad = dirRad + Math.PI / 2;
  const off = 2.6 * m.mid;
  const ox = Math.cos(perpRad) * off;
  const oy = Math.sin(perpRad) * off;
  const tipBack = 8 * m.mid;
  const sx = x2 - Math.cos(dirRad) * tipBack;
  const sy = y2 - Math.sin(dirRad) * tipBack;
  const head = 10 * m.mid, wing = 5.5 * m.mid;
  const hx1 = x2 - Math.cos(dirRad) * head + Math.sin(dirRad) * wing;
  const hy1 = y2 - Math.sin(dirRad) * head - Math.cos(dirRad) * wing;
  const hx2 = x2 - Math.cos(dirRad) * head - Math.sin(dirRad) * wing;
  const hy2 = y2 - Math.sin(dirRad) * head + Math.cos(dirRad) * wing;
  return (
    <g stroke={color} strokeWidth={2 * m.px} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1={x1 + ox} y1={y1 + oy} x2={sx + ox} y2={sy + oy} />
      <line x1={x1 - ox} y1={y1 - oy} x2={sx - ox} y2={sy - oy} />
      <path d={`M ${hx1} ${hy1} L ${x2} ${y2} L ${hx2} ${hy2}`} />
    </g>
  );
}

// Current flow field: short fine arrows distributed around the boat, all
// pointing in the direction the water flows. Reads as a river current.
function CurrentFlowField({ flowAngleDeg, color, m }: { flowAngleDeg: number; color: string; m: Metrics }) {
  const flowRad = ((flowAngleDeg - 90) * Math.PI) / 180;
  const fx = Math.cos(flowRad), fy = Math.sin(flowRad);
  const px = -fy, py = fx; // perpendicular unit
  const lineLen = 38;
  const HEAD = 4 * m.mid, WING = 2.2 * m.mid;
  const positions: Array<[number, number]> = [];
  // 2 rows of 3 lines either side of the boat.
  const perpOffsets = [-58, 58];
  const alongOffsets = [-46, 0, 46];
  for (const a of alongOffsets) {
    for (const p of perpOffsets) {
      positions.push([CENTER + fx * a + px * p, CENTER + fy * a + py * p]);
    }
  }

  return (
    <g stroke={color} strokeWidth={1 * m.px} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
      {positions.map(([cx, cy], i) => {
        const distC = Math.hypot(cx - CENTER, cy - CENTER);
        if (distC > COMPASS_R - 4) return null;
        if (distC < 30) return null; // keep clear of the hull
        const tailX = cx - fx * lineLen / 2;
        const tailY = cy - fy * lineLen / 2;
        const tipX = cx + fx * lineLen / 2;
        const tipY = cy + fy * lineLen / 2;
        const hx1 = tipX - fx * HEAD + px * WING;
        const hy1 = tipY - fy * HEAD + py * WING;
        const hx2 = tipX - fx * HEAD - px * WING;
        const hy2 = tipY - fy * HEAD - py * WING;
        return (
          <g key={i}>
            <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} />
            <path d={`M ${hx1} ${hy1} L ${tipX} ${tipY} L ${hx2} ${hy2}`} />
          </g>
        );
      })}
    </g>
  );
}

function WaveMark({ angleDeg, color, m }: { angleDeg: number; color: string; m: Metrics }) {
  const [tipX, tipY] = polarXY(angleDeg, ARROW_TIP_R + 8);
  const [tailX, tailY] = polarXY(angleDeg, ARROW_TAIL_R - 4);
  const dx = tipX - tailX;
  const dy = tipY - tailY;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const amp = 3.2 * m.mid;
  // Reserve a straight section just before the tip so the arrowhead reads as
  // a clean chevron (not jammed into the last sinusoid bump).
  const TAIL_STRAIGHT = 10;
  const wavyEnd = len - TAIL_STRAIGHT;
  const N = 16;
  const points: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const dist = wavyEnd * t;
    const o = Math.sin(t * Math.PI * 3) * amp * (1 - t * 0.5); // taper amp toward the tip
    points.push(`${tailX + ux * dist + nx * o},${tailY + uy * dist + ny * o}`);
  }
  points.push(`${tipX},${tipY}`);

  const HEAD = 7 * m.mid, WING = 4 * m.mid;
  const hx1 = tipX - ux * HEAD + nx * WING;
  const hy1 = tipY - uy * HEAD + ny * WING;
  const hx2 = tipX - ux * HEAD - nx * WING;
  const hy2 = tipY - uy * HEAD - ny * WING;
  return (
    <g stroke={color} strokeWidth={1.7 * m.px} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={points.join(" ")} />
      <path d={`M ${hx1} ${hy1} L ${tipX} ${tipY} L ${hx2} ${hy2}`} />
    </g>
  );
}

// Top-down hull silhouette: pointed bow up, flat transom at the bottom.
// Drawn centred on (0,0) so it can be translated + rotated by bearing.
function BoatHull({ m }: { m: Metrics }) {
  return (
    <g>
      <path
        d="
          M 0 -34
          C -8 -28, -14 -16, -14 -2
          C -14 8, -14 16, -13 22
          L 13 22
          C 14 16, 14 8, 14 -2
          C 14 -16, 8 -28, 0 -34
          Z
        "
        fill="var(--ow-bg-2)"
        stroke="var(--ow-fg-0)"
        strokeWidth={1.6 * m.px}
        strokeLinejoin="round"
      />
      <line x1="0" y1="-26" x2="0" y2="20" stroke="var(--ow-fg-2)" strokeWidth={0.8 * m.px} />
      <circle cx="0" cy="-4" r={2.2 * m.mid} fill="var(--ow-accent)" />
      <path d="M 0 -34 L -3 -28 L 3 -28 Z" fill="var(--ow-fg-0)" stroke="none" />
    </g>
  );
}

// Cardinal letters just outside the dial.
function CardinalMarkers({ m }: { m: Metrics }) {
  const items: { label: string; deg: number }[] = [
    { label: "N", deg: 0 },
    { label: "E", deg: 90 },
    { label: "S", deg: 180 },
    { label: "W", deg: 270 },
  ];
  return (
    <g>
      {items.map(({ label, deg }) => {
        const [x, y] = polarXY(deg, COMPASS_R + 9 * m.px);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9 * m.px}
            fill="var(--ow-fg-3)"
            style={{ fontFamily: "var(--ow-font-mono)", fontWeight: 600 }}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

// Translucent annular sector from `from` clockwise to `to`: the directions a
// force took across the steps of the leg, shaded around its mean arrow.
function SpreadArc({ arc, color }: { arc: [number, number]; color: string }) {
  const [from, to] = arc;
  const sweep = ((to - from) % 360 + 360) % 360;
  if (sweep < 1) return null;
  const large = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = polarXY(from, COMPASS_R);
  const [ox2, oy2] = polarXY(to, COMPASS_R);
  const [ix1, iy1] = polarXY(to, ARC_INNER_R);
  const [ix2, iy2] = polarXY(from, ARC_INNER_R);
  const d =
    `M ${ox1} ${oy1} A ${COMPASS_R} ${COMPASS_R} 0 ${large} 1 ${ox2} ${oy2} ` +
    `L ${ix1} ${iy1} A ${ARC_INNER_R} ${ARC_INNER_R} 0 ${large} 0 ${ix2} ${iy2} Z`;
  return <path d={d} fill={color} fillOpacity="0.16" stroke="none" />;
}

export interface ConditionsCompassProps {
  /** Rendered width and height, in pixels. */
  size: number;
  bearingDeg: number;
  /** True wind direction the wind comes FROM. */
  windDeg: number;
  /** Direction the waves come FROM, null without sea data. */
  waveDeg: number | null;
  /** Direction the current sets TO, null without current data. */
  currentDeg: number | null;
  currentColor: string;
  /** Arc of wind directions across the steps of a leg, see `legSpread`. */
  windArc?: [number, number] | null;
  currentArc?: [number, number] | null;
  ariaLabel: string;
}

export function ConditionsCompass({
  size,
  bearingDeg,
  windDeg,
  waveDeg,
  currentDeg,
  currentColor,
  windArc = null,
  currentArc = null,
  ariaLabel,
}: ConditionsCompassProps) {
  const scale = size / SIZE;
  const m: Metrics = { px: 1 / scale, mid: 1 / Math.sqrt(scale) };
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-label={ariaLabel}
      role="img"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={COMPASS_R}
        fill="none"
        stroke="var(--ow-line-2)"
        strokeWidth={1 * m.px}
        strokeDasharray={`${2 * m.px} ${4 * m.px}`}
      />
      <CardinalMarkers m={m} />

      {/* Spread first, so the arrows draw over the haze. */}
      {windArc && <SpreadArc arc={windArc} color={FORCE_COLORS.wind} />}
      {currentArc && <SpreadArc arc={currentArc} color={currentColor} />}

      {currentDeg != null && <CurrentFlowField flowAngleDeg={currentDeg} color={currentColor} m={m} />}

      <g transform={`translate(${CENTER} ${CENTER}) rotate(${bearingDeg})`}>
        <BoatHull m={m} />
      </g>

      <WindArrow fromR={ARROW_TAIL_R} toR={ARROW_TIP_R} angleDeg={windDeg} color={FORCE_COLORS.wind} m={m} />
      {waveDeg != null && <WaveMark angleDeg={waveDeg} color={FORCE_COLORS.waves} m={m} />}
    </svg>
  );
}
