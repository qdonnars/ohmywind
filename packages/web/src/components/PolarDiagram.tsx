// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useRef, useState } from "react";
import { visiblePolarPoints } from "./polarPoints";

// Pure polar diagram — wind from the top, right half-circle. Extracted from
// the former monolithic PolarEditor so the "Essentiel" tile can show the
// resulting polar read-only while the "Avancé" tile mounts an editable one.
//
// The no-go zone is first-class: curves are cut at `minUpwindDeg` instead of
// being drawn through it (a qtVlm file's 0°-row of zeros used to drag every
// curve into a spike at the grid's first angle), and the sector is shaded.

// SVG canvas geometry: 480x500, polar centered at (240, 240).
const VIEW_W = 480;
const VIEW_H = 500;
const CX = 240;
const CY = 240;
// Outer ring radius — the maximum boat speed across the polar is scaled to
// this many pixels.
const R_MAX = 200;
const HANDLE_R = 6;
const HANDLE_R_HOVER = 8;

function pickRingStep(maxSpeed: number): number {
  if (maxSpeed <= 6) return 1;
  if (maxSpeed <= 12) return 2;
  return 3;
}

function polarToCartesian(twaDeg: number, r: number): { x: number; y: number } {
  // Wind from the top (twa=0 → 12 o'clock), right half-circle visible.
  // SVG y axis points down, so we subtract r * cos(twa).
  const rad = (twaDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function curvePath(twaDeg: number[], speeds: number[], minUpwindDeg: number, pxPerKn: number): string {
  // Straight-segment polyline between the visible TWA points. Smoothing with
  // Bezier would look prettier but obscures the underlying data points, which
  // the user may be editing — straight is honest.
  const pts = visiblePolarPoints(twaDeg, speeds, minUpwindDeg).map((p) =>
    polarToCartesian(p.twa, p.speed * pxPerKn),
  );
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export interface PolarDiagramProps {
  title: string;
  subtitle?: string;
  twsKn: number[];
  twaDeg: number[];
  // [tws_idx][twa_idx] -> boat speed in knots.
  matrix: number[][];
  selectedTwsIdx: number;
  // No-go boundary (deg TWA): curves are cut below it, the sector is shaded.
  minUpwindDeg: number;
  // Drag-to-edit on the selected curve. Read-only markers when absent.
  editable?: boolean;
  // Cell keys `${twsIdx},${twaIdx}` currently overridden (accent handles).
  overriddenKeys?: ReadonlySet<string>;
  onCellChange?: (twsIdx: number, twaIdx: number, speedKn: number) => void;
}

export function PolarDiagram({
  title,
  subtitle,
  twsKn,
  twaDeg,
  matrix,
  selectedTwsIdx,
  minUpwindDeg,
  editable = false,
  overriddenKeys,
  onCellChange,
}: PolarDiagramProps) {
  const [hoverHandle, setHoverHandle] = useState<number | null>(null);
  // Index of the TWA point currently being dragged, used to render a live
  // speed label next to the moving handle. Null when no drag is in progress.
  const [draggingTwaIdx, setDraggingTwaIdx] = useState<number | null>(null);

  // The selection can outlive a grid change (file import, source flip to a
  // shorter TWS list); clamp at render time instead of resetting in an effect.
  const activeTwsIdx = Math.min(selectedTwsIdx, twsKn.length - 1);
  const maxSpeed = useMemo(() => {
    let m = 0;
    for (const row of matrix) for (const v of row) if (v > m) m = v;
    return Math.max(1, m);
  }, [matrix]);
  const pxPerKn = R_MAX / maxSpeed;
  const ringStep = pickRingStep(maxSpeed);
  const ringSpeeds = useMemo(() => {
    const out: number[] = [];
    for (let s = ringStep; s <= maxSpeed; s += ringStep) out.push(s);
    return out;
  }, [maxSpeed, ringStep]);

  const svgRef = useRef<SVGSVGElement>(null);

  // Drag state — held in a ref so the move/up listeners don't capture stale
  // closures. The visual highlight uses `hoverHandle` state for re-renders.
  const dragRef = useRef<{ twsIdx: number; twaIdx: number; twaDeg: number } | null>(null);

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onHandlePointerDown(e: React.PointerEvent, twaIdx: number) {
    if (!editable || !onCellChange) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { twsIdx: activeTwsIdx, twaIdx, twaDeg: twaDeg[twaIdx] };
    setDraggingTwaIdx(twaIdx);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !onCellChange) return;
    const local = clientToSvg(e.clientX, e.clientY);
    if (!local) return;
    // Project cursor onto the radius for the dragged TWA: the new speed is
    // the cursor's signed distance from the center along the angle's axis.
    // (Dot product of the cursor vector with the unit radial vector.)
    const rad = (drag.twaDeg * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = -Math.cos(rad);
    const dx = local.x - CX;
    const dy = local.y - CY;
    const rPx = dx * ux + dy * uy;
    onCellChange(drag.twsIdx, drag.twaIdx, rPx / pxPerKn);
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggingTwaIdx(null);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Some browsers throw if capture was already released — harmless.
    }
  }

  // No-go sector: pie slice from dead upwind (0°) to the minimum angle.
  const noGoPath = useMemo(() => {
    if (minUpwindDeg <= 0) return null;
    const top = polarToCartesian(0, R_MAX);
    const edge = polarToCartesian(minUpwindDeg, R_MAX);
    return `M${CX},${CY} L${top.x},${top.y} A${R_MAX},${R_MAX} 0 0 1 ${edge.x.toFixed(1)},${edge.y.toFixed(1)} Z`;
  }, [minUpwindDeg]);
  const noGoEdge = polarToCartesian(minUpwindDeg, R_MAX);

  return (
    <div className="polar-svg-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="polar-svg"
        role="img"
        aria-label={`Diagramme polaire : ${title}`}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      >
        {/* Title */}
        <text x={CX} y={26} textAnchor="middle" className="polar-title">
          {title}
        </text>
        {subtitle && (
          <text x={CX} y={44} textAnchor="middle" className="polar-subtitle">
            {subtitle}
          </text>
        )}

        {/* Speed rings */}
        {ringSpeeds.map((s) => (
          <circle key={s} cx={CX} cy={CY} r={s * pxPerKn} fill="none" className="polar-ring" />
        ))}

        {/* No-go zone: shaded sector + dashed boundary ray. Drawn before the
            axes/curves so it reads as background. */}
        {noGoPath && (
          <g>
            <path d={noGoPath} className="polar-nogo" />
            <line
              x1={CX}
              y1={CY}
              x2={noGoEdge.x}
              y2={noGoEdge.y}
              className="polar-nogo-edge"
            />
          </g>
        )}

        {/* Wind axis (vertical) + horizontal axis */}
        <line x1={CX} y1={CY - R_MAX - 10} x2={CX} y2={CY + R_MAX + 10} className="polar-axis" />
        <line x1={CX} y1={CY} x2={CX + R_MAX + 10} y2={CY} className="polar-axis" />

        {/* Angular ticks and labels (right side, every twa point). A dead-run
            tick is appended when the grid stops short of 180°: the drawn curve
            is clamp-extended there (see polarPoints), the scale must follow. */}
        {(twaDeg[twaDeg.length - 1] < 180 ? [...twaDeg, 180] : twaDeg).map((twa) => {
          const inner = polarToCartesian(twa, R_MAX);
          const outer = polarToCartesian(twa, R_MAX + 10);
          const label = polarToCartesian(twa, R_MAX + 22);
          return (
            <g key={twa}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="polar-tick" />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="polar-angle-label"
              >
                {twa}°
              </text>
            </g>
          );
        })}

        {/* Speed ring labels */}
        {ringSpeeds.map((s) => (
          <text key={s} x={CX + s * pxPerKn + 4} y={CY - 4} className="polar-speed-label">
            {s} kn
          </text>
        ))}

        {/* Non-selected curves: thin, faded */}
        {matrix.map((row, twsIdx) => {
          if (twsIdx === activeTwsIdx) return null;
          return (
            <path
              key={twsIdx}
              d={curvePath(twaDeg, row, minUpwindDeg, pxPerKn)}
              fill="none"
              className="polar-curve-faded"
            />
          );
        })}

        {/* Selected curve: thick, accent */}
        <path
          d={curvePath(twaDeg, matrix[activeTwsIdx], minUpwindDeg, pxPerKn)}
          fill="none"
          className="polar-curve-selected"
        />

        {/* Handles for the selected curve — draggable when editable, plain
            markers otherwise. Grid points inside the no-go zone are skipped
            (they are not part of the drawn curve). */}
        {matrix[activeTwsIdx].map((speed, twaIdx) => {
          if (twaDeg[twaIdx] < minUpwindDeg) return null;
          const pt = polarToCartesian(twaDeg[twaIdx], speed * pxPerKn);
          const isHover = hoverHandle === twaIdx;
          const isDragging = draggingTwaIdx === twaIdx;
          const isOverridden = overriddenKeys?.has(`${activeTwsIdx},${twaIdx}`) ?? false;
          return (
            <circle
              key={twaIdx}
              cx={pt.x}
              cy={pt.y}
              r={isHover || isDragging ? HANDLE_R_HOVER : HANDLE_R}
              className={`polar-handle ${isOverridden ? "is-overridden" : ""} ${editable ? "" : "is-readonly"}`}
              onPointerDown={(e) => onHandlePointerDown(e, twaIdx)}
              onPointerEnter={() => setHoverHandle(twaIdx)}
              onPointerLeave={() => setHoverHandle(null)}
            >
              <title>
                TWA {twaDeg[twaIdx]}° · {speed.toFixed(1)} kn
                {editable ? " (glisser pour ajuster)" : ""}
              </title>
            </circle>
          );
        })}

        {/* Live speed label rendered while dragging — sits slightly outside
            the handle along its radial axis so it never overlaps the point. */}
        {draggingTwaIdx !== null &&
          (() => {
            const twa = twaDeg[draggingTwaIdx];
            const speed = matrix[activeTwsIdx][draggingTwaIdx];
            const r = speed * pxPerKn;
            // Push the label well outside the handle so the dragged finger
            // (or cursor) doesn't sit on top of the value. Cap inside the
            // SVG canvas to avoid clipping at low speeds.
            const labelR = Math.min(R_MAX + 50, Math.max(r + 34, 38));
            const pt = polarToCartesian(twa, labelR);
            return (
              <g pointerEvents="none">
                <rect
                  x={pt.x - 22}
                  y={pt.y - 11}
                  width={44}
                  height={22}
                  rx={6}
                  className="polar-drag-label-bg"
                />
                <text
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="polar-drag-label"
                >
                  {speed.toFixed(1)} kn
                </text>
              </g>
            );
          })()}
      </svg>

      <style>{`
        .polar-svg-wrap {
          background: var(--ow-bg-1);
          border: 1px solid var(--ow-line-2);
          border-radius: 12px;
          padding: 12px;
        }
        .polar-svg {
          width: 100%;
          height: auto;
          display: block;
          color: var(--ow-fg-0);
        }
        .polar-title {
          font-size: 14px;
          font-weight: 700;
          fill: currentColor;
        }
        .polar-subtitle {
          font-size: 10px;
          opacity: 0.6;
          fill: currentColor;
        }
        .polar-ring {
          stroke: currentColor;
          stroke-width: 0.6;
          opacity: 0.18;
        }
        .polar-nogo {
          fill: currentColor;
          opacity: 0.06;
        }
        .polar-nogo-edge {
          stroke: currentColor;
          stroke-width: 1;
          stroke-dasharray: 4 4;
          opacity: 0.35;
        }
        .polar-axis {
          stroke: currentColor;
          stroke-width: 0.8;
          opacity: 0.4;
        }
        .polar-tick {
          stroke: currentColor;
          stroke-width: 0.8;
          opacity: 0.55;
        }
        .polar-angle-label {
          font-size: 10px;
          opacity: 0.7;
          fill: currentColor;
        }
        .polar-speed-label {
          font-size: 9px;
          opacity: 0.5;
          fill: currentColor;
          font-family: ui-monospace, monospace;
        }
        .polar-curve-faded {
          stroke: currentColor;
          stroke-width: 1.1;
          opacity: 0.18;
        }
        .polar-curve-selected {
          stroke: var(--ow-accent);
          stroke-width: 2;
          opacity: 0.95;
        }
        .polar-handle {
          fill: var(--ow-accent);
          stroke: var(--ow-bg-0);
          stroke-width: 1.5;
          cursor: ns-resize;
          touch-action: none;
        }
        .polar-handle:hover {
          fill: var(--ow-on-accent);
        }
        .polar-handle.is-overridden {
          fill: var(--ow-warn);
        }
        .polar-handle.is-readonly {
          cursor: default;
        }
        .polar-handle.is-readonly:hover {
          fill: var(--ow-accent);
        }
        .polar-drag-label-bg {
          fill: var(--ow-bg-0);
          stroke: var(--ow-accent);
          stroke-width: 1.2;
        }
        .polar-drag-label {
          fill: var(--ow-fg-0);
          font-size: 11px;
          font-weight: 700;
          font-family: ui-monospace, monospace;
        }
      `}</style>
    </div>
  );
}

// Small pill row selecting which TWS curve is highlighted in the diagram.
export function TwsPills({
  twsKn,
  selectedIdx,
  onSelect,
  label,
}: {
  twsKn: number[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  label: string;
}) {
  const active = Math.min(selectedIdx, twsKn.length - 1);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wider opacity-70">{label}</span>
      <div className="flex gap-1 flex-wrap">
        {twsKn.map((tws, idx) => (
          <button
            key={tws}
            type="button"
            onClick={() => onSelect(idx)}
            className={`polar-tws-btn ${idx === active ? "is-selected" : ""}`}
          >
            {tws} kn
          </button>
        ))}
      </div>
    </div>
  );
}
