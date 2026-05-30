import { useMemo, useRef, useState } from "react";
import {
  ARCHETYPE_LABELS,
  BASE_POLARS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SERVER_DEFAULT_EFFICIENCY,
  defaultPolarConfig,
  effectivePolar,
  hasOverrides,
  loadPolarConfig,
  savePolarConfig,
  type PolarConfig,
  type PolarData,
  type SpiKind,
} from "../config/polarConfig";

// SVG canvas geometry. Matches the methodologie polar visual but smaller
// and tuned for an editor pane: 480x500, polar centered at (240, 240).
const VIEW_W = 480;
const VIEW_H = 500;
const CX = 240;
const CY = 240;
// Outer ring radius — the maximum boat speed across the polar is scaled to
// (slightly under) this many pixels so the diagram always fills the canvas
// regardless of archetype.
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

function curvePath(twaDegs: number[], speeds: number[], pxPerKn: number): string {
  // Straight-segment polyline between the 9 TWA points. Smoothing with Bezier
  // would look prettier but obscures the underlying data points, which the
  // user is editing here — straight is honest.
  const pts = speeds.map((v, i) => polarToCartesian(twaDegs[i], v * pxPerKn));
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function PolarEditor() {
  const [config, setConfig] = useState<PolarConfig>(() => loadPolarConfig());
  const [selectedTwsIdx, setSelectedTwsIdx] = useState(0);
  const [hoverHandle, setHoverHandle] = useState<number | null>(null);
  // Index of the TWA point currently being dragged, used to render a live
  // speed label next to the moving handle. Null when no drag is in progress.
  const [draggingTwaIdx, setDraggingTwaIdx] = useState<number | null>(null);

  function update(next: PolarConfig) {
    setConfig(next);
    savePolarConfig(next);
  }

  function setBase(base: string) {
    if (base === config.base) return;
    // Clear overrides when switching base because they're keyed by grid index
    // (twsIdx, twaIdx) and a different archetype may have a different grid.
    // Scale + spi are archetype-agnostic so we keep them as-is.
    update({ base, scale: config.scale, spi: config.spi, overrides: {} });
    // The new archetype may have a shorter TWS grid; snap selection back to 0
    // here rather than in an effect to avoid cascading renders.
    if (selectedTwsIdx >= BASE_POLARS[base].tws_kn.length) setSelectedTwsIdx(0);
  }

  function setScale(scale: number) {
    update({ ...config, scale });
  }

  function setSpi(spi: SpiKind) {
    update({ ...config, spi });
  }

  function setOverride(twsIdx: number, twaIdx: number, speedKn: number) {
    const clamped = Math.max(0, Math.min(30, Math.round(speedKn * 10) / 10));
    update({
      ...config,
      overrides: { ...config.overrides, [`${twsIdx},${twaIdx}`]: clamped },
    });
  }

  function resetAll() {
    update(defaultPolarConfig());
  }

  function clearOverrides() {
    update({ ...config, overrides: {} });
  }

  const effective = useMemo<PolarData>(() => effectivePolar(config), [config]);
  const maxSpeed = useMemo(() => {
    let m = 0;
    for (const row of effective.boat_speed_kn) for (const v of row) if (v > m) m = v;
    return Math.max(1, m);
  }, [effective]);
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
  const dragRef = useRef<{
    twsIdx: number;
    twaIdx: number;
    twaDeg: number;
  } | null>(null);

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
    e.preventDefault();
    e.stopPropagation();
    const twaDeg = effective.twa_deg[twaIdx];
    dragRef.current = { twsIdx: selectedTwsIdx, twaIdx, twaDeg };
    setDraggingTwaIdx(twaIdx);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
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
    const newSpeed = rPx / pxPerKn;
    setOverride(drag.twsIdx, drag.twaIdx, newSpeed);
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

  const overrideCount = Object.keys(config.overrides).length;

  return (
    <div className="polar-editor flex flex-col gap-4">
      {/* Reminder banner: this polar is the structural boat speed; the planner
          applies its own efficiency coefficient on top at plan time. */}
      <div className="polar-banner">
        <span className="polar-banner-icon" aria-hidden>ⓘ</span>
        <div className="polar-banner-text">
          Cette polaire décrit la vitesse théorique de ton bateau (structurelle).
          Au moment du plan, l'app la multiplie par un coefficient d'efficacité
          qui dépend des conditions (aujourd'hui <strong>{SERVER_DEFAULT_EFFICIENCY.toFixed(2)}</strong> en croisière).
        </div>
      </div>

      {/* Top controls: archetype + multiplier */}
      <div className="grid sm:grid-cols-[1fr_1fr] gap-4 items-end">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          Archétype de base
          <select
            className="polar-select"
            value={config.base}
            onChange={(e) => setBase(e.target.value)}
          >
            {Object.entries(ARCHETYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wider opacity-70">
          Facteur multiplicateur ({config.scale.toFixed(2)}×)
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={SCALE_STEP}
            value={config.scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="polar-range"
          />
          <span className="text-[10px] opacity-60 normal-case tracking-normal mt-0.5">
            Plus rapide ou plus lent que l'archétype ? 1.0× = identique.
          </span>
        </label>
      </div>

      {/* Spinnaker selector — applies a per-TWA boost across all TWS curves. */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-wider opacity-70">
          Spinnaker
        </span>
        <div className="polar-spi-segment" role="radiogroup" aria-label="Type de spi">
          <button
            type="button"
            role="radio"
            aria-checked={config.spi === "off"}
            onClick={() => setSpi("off")}
            className={`polar-spi-btn ${config.spi === "off" ? "is-active" : ""}`}
          >
            Aucun
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={config.spi === "asymmetric"}
            onClick={() => setSpi("asymmetric")}
            className={`polar-spi-btn ${config.spi === "asymmetric" ? "is-active" : ""}`}
            title="Asymétrique : sweet spot reaching 110-135°, utile jusqu'à 150° en heat-up"
          >
            Asymétrique
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={config.spi === "symmetric"}
            onClick={() => setSpi("symmetric")}
            className={`polar-spi-btn ${config.spi === "symmetric" ? "is-active" : ""}`}
            title="Symétrique : optimal au plein-vent arrière, 135-165° (pole requis)"
          >
            Symétrique
          </button>
        </div>
      </div>

      {/* TWS selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider opacity-70">
          Courbe éditable (TWS)
        </span>
        <div className="flex gap-1 flex-wrap">
          {effective.tws_kn.map((tws, idx) => (
            <button
              key={tws}
              type="button"
              onClick={() => setSelectedTwsIdx(idx)}
              className={`polar-tws-btn ${idx === selectedTwsIdx ? "is-selected" : ""}`}
            >
              {tws} kn
            </button>
          ))}
        </div>
      </div>

      {/* SVG diagram */}
      <div className="polar-svg-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="polar-svg"
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          {/* Title */}
          <text x={CX} y={26} textAnchor="middle" className="polar-title">
            {ARCHETYPE_LABELS[config.base]}
          </text>
          <text x={CX} y={44} textAnchor="middle" className="polar-subtitle">
            {config.scale.toFixed(2)}× · {config.spi === "off" ? "sans spi" : config.spi === "asymmetric" ? "spi asymétrique" : "spi symétrique"} · {overrideCount > 0 ? `${overrideCount} point(s) ajusté(s)` : "aucun ajustement"}
          </text>

          {/* Speed rings */}
          {ringSpeeds.map((s) => (
            <circle
              key={s}
              cx={CX}
              cy={CY}
              r={s * pxPerKn}
              fill="none"
              className="polar-ring"
            />
          ))}
          {/* Wind axis (vertical) + horizontal axis */}
          <line x1={CX} y1={CY - R_MAX - 10} x2={CX} y2={CY + R_MAX + 10} className="polar-axis" />
          <line x1={CX} y1={CY} x2={CX + R_MAX + 10} y2={CY} className="polar-axis" />

          {/* Angular ticks and labels (right side, every twa point) */}
          {effective.twa_deg.map((twa) => {
            const inner = polarToCartesian(twa, R_MAX);
            const outer = polarToCartesian(twa, R_MAX + 10);
            const label = polarToCartesian(twa, R_MAX + 22);
            return (
              <g key={twa}>
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="polar-tick" />
                <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="polar-angle-label">
                  {twa}°
                </text>
              </g>
            );
          })}

          {/* Speed ring labels */}
          {ringSpeeds.map((s) => (
            <text
              key={s}
              x={CX + s * pxPerKn + 4}
              y={CY - 4}
              className="polar-speed-label"
            >
              {s} kn
            </text>
          ))}

          {/* Non-selected curves: thin, faded */}
          {effective.boat_speed_kn.map((row, twsIdx) => {
            if (twsIdx === selectedTwsIdx) return null;
            return (
              <path
                key={twsIdx}
                d={curvePath(effective.twa_deg, row, pxPerKn)}
                fill="none"
                className="polar-curve-faded"
              />
            );
          })}

          {/* Selected curve: thick, accent */}
          <path
            d={curvePath(
              effective.twa_deg,
              effective.boat_speed_kn[selectedTwsIdx],
              pxPerKn,
            )}
            fill="none"
            className="polar-curve-selected"
          />

          {/* Draggable handles for the selected curve */}
          {effective.boat_speed_kn[selectedTwsIdx].map((speed, twaIdx) => {
            const pt = polarToCartesian(effective.twa_deg[twaIdx], speed * pxPerKn);
            const isHover = hoverHandle === twaIdx;
            const isDragging = draggingTwaIdx === twaIdx;
            const key = `${selectedTwsIdx},${twaIdx}`;
            const isOverridden = key in config.overrides;
            return (
              <circle
                key={twaIdx}
                cx={pt.x}
                cy={pt.y}
                r={isHover || isDragging ? HANDLE_R_HOVER : HANDLE_R}
                className={`polar-handle ${isOverridden ? "is-overridden" : ""}`}
                onPointerDown={(e) => onHandlePointerDown(e, twaIdx)}
                onPointerEnter={() => setHoverHandle(twaIdx)}
                onPointerLeave={() => setHoverHandle(null)}
              >
                <title>
                  TWA {effective.twa_deg[twaIdx]}° · {speed.toFixed(1)} kn (glisser pour ajuster)
                </title>
              </circle>
            );
          })}

          {/* Live speed label rendered while dragging — sits slightly outside
              the handle along its radial axis so it never overlaps the point.
              Read directly from the effective polar so it stays in sync as
              setOverride fires on each pointer move. */}
          {draggingTwaIdx !== null && (() => {
            const twa = effective.twa_deg[draggingTwaIdx];
            const speed = effective.boat_speed_kn[selectedTwsIdx][draggingTwaIdx];
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
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs opacity-70">
          Glisse un point de la courbe sélectionnée pour ajuster sa vitesse, ou
          utilise le slider pour mettre toute la polaire à l'échelle.
        </div>
        <div className="flex gap-2">
          {hasOverrides(config) && (
            <button type="button" onClick={clearOverrides} className="polar-btn">
              Effacer les ajustements
            </button>
          )}
          <button type="button" onClick={resetAll} className="polar-btn">
            Réinitialiser tout
          </button>
        </div>
      </div>

      <style>{`
        .polar-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--ow-accent, #14b8a6) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--ow-accent, #14b8a6) 35%, transparent);
        }
        .polar-banner-icon {
          font-size: 14px;
          font-weight: 700;
          color: var(--ow-accent, #14b8a6);
          line-height: 1.4;
          flex-shrink: 0;
        }
        .polar-banner-text {
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--ow-fg-0, #e2e8f0);
        }
        .polar-banner-text strong {
          color: var(--ow-accent, #14b8a6);
          font-weight: 700;
        }
        .polar-select, .polar-range {
          background: var(--ow-bg-1, rgba(255,255,255,0.04));
          color: var(--ow-fg-0, #e2e8f0);
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.10));
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }
        .polar-range {
          padding: 0;
          accent-color: var(--ow-accent, #14b8a6);
        }
        .polar-spi-segment {
          display: inline-flex;
          gap: 2px;
          padding: 2px;
          border-radius: 10px;
          background: var(--ow-bg-1, rgba(255,255,255,0.04));
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.10));
        }
        .polar-spi-btn {
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--ow-fg-1, #cbd5e1);
          background: transparent;
          border: 0;
          transition: background 120ms ease, color 120ms ease;
        }
        .polar-spi-btn:hover:not(.is-active) {
          background: var(--ow-bg-2, rgba(255,255,255,0.06));
          color: var(--ow-fg-0, #e2e8f0);
        }
        .polar-spi-btn.is-active {
          background: var(--ow-accent, #14b8a6);
          color: #fff;
        }
        .polar-tws-btn {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          background: var(--ow-bg-1, rgba(255,255,255,0.04));
          color: var(--ow-fg-1, #cbd5e1);
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.10));
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .polar-tws-btn:hover {
          background: var(--ow-bg-2, rgba(255,255,255,0.08));
        }
        .polar-tws-btn.is-selected {
          background: var(--ow-accent, #14b8a6);
          color: #fff;
          border-color: var(--ow-accent, #14b8a6);
        }
        .polar-svg-wrap {
          background: var(--ow-bg-1, rgba(255,255,255,0.03));
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.08));
          border-radius: 12px;
          padding: 12px;
        }
        .polar-svg {
          width: 100%;
          height: auto;
          display: block;
          color: var(--ow-fg-0, #e2e8f0);
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
          stroke: var(--ow-accent, #14b8a6);
          stroke-width: 2;
          opacity: 0.95;
        }
        .polar-handle {
          fill: var(--ow-accent, #14b8a6);
          stroke: var(--ow-bg-0, #0b1220);
          stroke-width: 1.5;
          cursor: ns-resize;
          touch-action: none;
        }
        .polar-handle:hover {
          fill: #fff;
        }
        .polar-handle.is-overridden {
          fill: #fbbf24;
        }
        .polar-drag-label-bg {
          fill: var(--ow-bg-0, #0b1220);
          stroke: var(--ow-accent, #14b8a6);
          stroke-width: 1.2;
        }
        .polar-drag-label {
          fill: var(--ow-fg-0, #e2e8f0);
          font-size: 11px;
          font-weight: 700;
          font-family: ui-monospace, monospace;
        }
        .polar-btn {
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 8px;
          color: var(--ow-fg-1, #cbd5e1);
          background: transparent;
          border: 1px solid var(--ow-line-2, rgba(255,255,255,0.12));
          transition: background 120ms ease, color 120ms ease;
        }
        .polar-btn:hover {
          background: var(--ow-bg-2, rgba(255,255,255,0.06));
          color: var(--ow-fg-0, #e2e8f0);
        }
      `}</style>
    </div>
  );
}
