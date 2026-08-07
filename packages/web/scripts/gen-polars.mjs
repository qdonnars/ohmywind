// Generates one SVG polar diagram per archetype JSON.
// - Half polar (right side only), the canonical sailing convention.
// - Open at the top: curves start at the polar's smallest defined TWA (e.g. 40°)
//   and never extend to 0°, because the planner models tacking (VMG projection)
//   in that zone rather than relying on a forced-to-zero polar speed.
// - Distinct qualitative colors per TWS, full speed scale labeled.
//
// Run with:  node packages/web/scripts/gen-polars.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLAR_SRC = path.join(
  __dirname,
  "../../data-adapters/src/openwind_data/routing/polars"
);
const OUT = path.join(__dirname, "../public/polars");

const W = 640;
const H = 660;
const CX = W / 2;
const CY = 320;
const R_MAX = 230;

// Distinct qualitative palette: cool light → warm hot, mirroring sail-friendliness.
const PALETTE = [
  "#38bdf8", // 6 kn — sky 400
  "#0ea5e9", // 8 kn — sky 500
  "#10b981", // 10 kn — emerald 500
  "#84cc16", // 12 kn — lime 500
  "#facc15", // 14 kn — yellow 400
  "#fb923c", // 16 kn — orange 400
  "#ef4444", // 20 kn — red 500
  "#d946ef", // 25 kn — fuchsia 500
];

const ARCHETYPE_HUMAN = {
  cruiser_20ft: "Croiseur 20 pieds",
  cruiser_25ft: "Croiseur 25 pieds",
  cruiser_30ft: "Croiseur 30 pieds",
  cruiser_40ft: "Croiseur 40 pieds",
  cruiser_50ft: "Croiseur 50 pieds",
  racer_cruiser: "Racer-cruiser",
  catamaran_40ft: "Catamaran 40 pieds",
};

const PERF_HUMAN = {
  slow: "performance modeste",
  average: "performance moyenne",
  fast: "performance vive",
};

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

// Convention: TWA=0 points up, TWA=90 right, TWA=180 down.
// `mirror = +1` right half, `-1` left half (polars are symmetric).
function polarPoint(twaDeg, r, mirror = 1) {
  const rad = deg2rad(twaDeg);
  return [CX + mirror * r * Math.sin(rad), CY - r * Math.cos(rad)];
}

function pickRingStep(maxSpeed) {
  if (maxSpeed <= 5) return 1;
  if (maxSpeed <= 12) return 2;
  if (maxSpeed <= 30) return 5;
  return 10;
}

function buildOpenPolarPath(twaArr, speedArr, scale) {
  // U-shape: trace right side from twa[0] to twa[-1], then mirror back left
  // from twa[-1] to twa[0]. No Z — the polar stays open at the close-hauled
  // top (TWA < twa[0]), where the planner uses VMG/tacking instead.
  const right = twaArr.map((twa, i) => {
    const [x, y] = polarPoint(twa, speedArr[i] * scale, +1);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const left = [];
  for (let i = twaArr.length - 1; i >= 0; i--) {
    const [x, y] = polarPoint(twaArr[i], speedArr[i] * scale, -1);
    left.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return [...right, ...left].join(" ");
}

function interpPolar(twa, twaArr, speedArr) {
  // Linear interpolation between polar samples (clamps at bounds).
  if (twa <= twaArr[0]) return speedArr[0];
  if (twa >= twaArr[twaArr.length - 1]) return speedArr[twaArr.length - 1];
  for (let i = 0; i < twaArr.length - 1; i++) {
    if (twa >= twaArr[i] && twa <= twaArr[i + 1]) {
      const t = (twa - twaArr[i]) / (twaArr[i + 1] - twaArr[i]);
      return speedArr[i] * (1 - t) + speedArr[i + 1] * t;
    }
  }
  return 0;
}

function findVmgOptimal(twaArr, speedArr) {
  // Sweep TWA in [twa[0], 90] to maximise VMG = polar(twa) * cos(twa).
  // Mirrors the Python `best_vmg_upwind` logic.
  const minTwa = twaArr[0];
  let bestTwa = minTwa;
  let bestSpeed = speedArr[0];
  let bestVmg = bestSpeed * Math.cos(deg2rad(minTwa));
  for (let twa = minTwa; twa <= 90; twa += 1) {
    const sp = interpPolar(twa, twaArr, speedArr);
    const vmg = sp * Math.cos(deg2rad(twa));
    if (vmg > bestVmg) {
      bestVmg = vmg;
      bestTwa = twa;
      bestSpeed = sp;
    }
  }
  return { twa: bestTwa, speed: bestSpeed };
}

function buildVmgArcPath(twaOpt, speedAtOpt, scale) {
  // Visual simplification of the planner's `v_eff(TWA) = polar(opt) * cos(opt - TWA)`:
  // we draw a STRAIGHT horizontal line at the polar tip's y-level, from the
  // right tip across to the left tip. This works because the polar tip at
  // TWA = opt and the true upwind-VMG point at TWA = 0 (height polar(opt) * cos(opt))
  // both sit at exactly the same y in Cartesian coords. The straight line
  // therefore preserves the two physically meaningful endpoints (polar tip +
  // upwind VMG on the wind axis) without the geometric bump that the literal
  // cos formula produces at TWA = opt/2.
  const [xRight, y] = polarPoint(twaOpt, speedAtOpt * scale, +1);
  const [xLeft] = polarPoint(twaOpt, speedAtOpt * scale, -1);
  return `M ${xLeft.toFixed(1)} ${y.toFixed(1)} L ${xRight.toFixed(1)} ${y.toFixed(1)}`;
}

function buildSvg(polar) {
  const { name, length_ft, examples = [], performance_class, tws_kn, twa_deg, boat_speed_kn } = polar;

  const human = ARCHETYPE_HUMAN[name] || name.replace(/_/g, " ");
  const perfLabel = PERF_HUMAN[performance_class] || performance_class || "";
  const minTwa = twa_deg[0];

  // Scale: max boat speed across all curves.
  let maxSpeed = 0;
  for (const row of boat_speed_kn) for (const v of row) if (v > maxSpeed) maxSpeed = v;
  const scale = R_MAX / maxSpeed;
  const ringStep = pickRingStep(maxSpeed);

  // ----- Speed rings (full circles, light grey) -----
  const rings = [];
  for (let s = ringStep; s <= maxSpeed + 0.5; s += ringStep) {
    const r = s * scale;
    rings.push(
      `<circle cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.18"/>`
    );
  }

  // ----- Speed labels (LEFT vertical axis, going both up and down from center) -----
  const speedLabels = [];
  for (let s = ringStep; s <= maxSpeed + 0.5; s += ringStep) {
    const r = s * scale;
    // Above center
    speedLabels.push(
      `<text x="${CX - 8}" y="${(CY - r + 3).toFixed(1)}" class="speed-label" text-anchor="end">${s} kn</text>`
    );
    // Below center
    speedLabels.push(
      `<text x="${CX - 8}" y="${(CY + r + 3).toFixed(1)}" class="speed-label" text-anchor="end">${s} kn</text>`
    );
  }
  // Center "0"
  speedLabels.push(
    `<text x="${CX - 8}" y="${CY + 3}" class="speed-label" text-anchor="end">0</text>`
  );

  // ----- Angular ticks + labels on the RIGHT perimeter only -----
  const ticks = [];
  const angleLabels = [];
  for (const twa of [30, 45, 60, 75, 90, 110, 135, 150]) {
    const [xIn, yIn] = polarPoint(twa, R_MAX - 6);
    const [xOut, yOut] = polarPoint(twa, R_MAX + 6);
    ticks.push(
      `<line x1="${xIn.toFixed(1)}" y1="${yIn.toFixed(1)}" x2="${xOut.toFixed(1)}" y2="${yOut.toFixed(1)}" stroke="currentColor" stroke-width="0.8" opacity="0.55"/>`
    );
    const [xL, yL] = polarPoint(twa, R_MAX + 22);
    angleLabels.push(
      `<text x="${xL.toFixed(1)}" y="${yL.toFixed(1)}" class="angle-label" text-anchor="middle" dominant-baseline="middle">${twa}°</text>`
    );
  }

  // ----- Vertical axis (wind axis) and horizontal axis -----
  const axisV = `<line x1="${CX}" y1="${CY - R_MAX - 6}" x2="${CX}" y2="${CY + R_MAX + 6}" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>`;
  const axisH = `<line x1="${CX}" y1="${CY}" x2="${CX + R_MAX + 6}" y2="${CY}" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>`;

  // Cardinal labels.
  const cardinal = `
    <text x="${CX}" y="${CY - R_MAX - 16}" class="cardinal" text-anchor="middle">0° : vent debout</text>
    <text x="${CX}" y="${CY + R_MAX + 22}" class="cardinal" text-anchor="middle">180° : vent arrière</text>
  `;

  // ----- Polar curves (one per TWS) plus VMG projection arc (dashed) -----
  const curves = boat_speed_kn
    .map((row, i) => {
      const tws = tws_kn[i];
      const color = PALETTE[i % PALETTE.length];
      const polarPath = buildOpenPolarPath(twa_deg, row, scale);
      const { twa: twaOpt, speed: speedAtOpt } = findVmgOptimal(twa_deg, row);
      const vmgPath = buildVmgArcPath(twaOpt, speedAtOpt, scale);
      return `<g>
        <path d="${polarPath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.95">
          <title>${tws} kn de vent réel : polaire</title>
        </path>
        <path d="${vmgPath}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="4 3" opacity="0.85">
          <title>${tws} kn de vent réel : projection VMG (louvoyage), TWA_opt = ${twaOpt}°</title>
        </path>
      </g>`;
    })
    .join("\n");

  // ----- Legend at the bottom -----
  // Two rows: TWS color swatches, then a convention reminder.
  const legendY = H - 56;
  const itemW = (W - 80) / tws_kn.length;
  const legend = tws_kn
    .map((tws, i) => {
      const color = PALETTE[i % PALETTE.length];
      const x = 40 + i * itemW;
      return `
        <g transform="translate(${x.toFixed(0)}, ${legendY})">
          <line x1="0" y1="6" x2="22" y2="6" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
          <text x="28" y="10" class="legend">${tws} kn</text>
        </g>`;
    })
    .join("");

  const conventionLegend = `
    <g transform="translate(${(W / 2 - 200).toFixed(0)}, ${H - 30})">
      <line x1="0" y1="6" x2="26" y2="6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.65"/>
      <text x="32" y="10" class="legend-conv">trait plein : polaire</text>
      <line x1="180" y1="6" x2="206" y2="6" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.65"/>
      <text x="212" y="10" class="legend-conv">pointillé : projection VMG (zone de louvoyage)</text>
    </g>
  `;

  // ----- Title block -----
  const title = `<text x="${CX}" y="28" class="archetype-name" text-anchor="middle">${human}</text>`;
  const subtitle = perfLabel
    ? `<text x="${CX}" y="50" class="archetype-meta" text-anchor="middle">${perfLabel}${length_ft ? ` · ${length_ft} pieds` : ""}</text>`
    : length_ft
      ? `<text x="${CX}" y="50" class="archetype-meta" text-anchor="middle">${length_ft} pieds</text>`
      : "";

  const exList = examples.length
    ? `<text x="${CX}" y="${H - 8}" class="archetype-meta" text-anchor="middle">${escapeXml("Exemples : " + examples.join(", "))}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">
  <title id="t">Polaire de vitesse : ${human}</title>
  <desc id="d">Diagramme polaire en demi-cercle (côté droit) montrant la vitesse du bateau (en nœuds, distance au centre) selon l'angle au vent TWA pour différentes vitesses de vent réel TWS. Une courbe par valeur de TWS. La zone TWA &lt; ${minTwa}° n'est pas tracée : dans cette zone le planificateur modélise le louvoyage via projection VMG.</desc>
  <style>
    text { fill: currentColor; }
    .archetype-name { font-size: 18px; font-weight: 600; }
    .archetype-meta { font-size: 11px; opacity: 0.65; }
    .speed-label { font-size: 10px; opacity: 0.55; font-family: ui-monospace, monospace; }
    .angle-label { font-size: 11px; opacity: 0.7; }
    .cardinal { font-size: 11px; opacity: 0.7; font-style: italic; }
    .legend { font-size: 11px; }
    .legend-conv { font-size: 10.5px; opacity: 0.7; font-style: italic; }
  </style>

  ${title}
  ${subtitle}

  <!-- Speed rings -->
  ${rings.join("\n  ")}

  <!-- Wind axis + horizontal axis -->
  ${axisV}
  ${axisH}

  <!-- Angular ticks + labels (right side only) -->
  ${ticks.join("\n  ")}
  ${angleLabels.join("\n  ")}

  <!-- Cardinal labels -->
  ${cardinal}

  <!-- Speed labels (left vertical axis, mirrored) -->
  ${speedLabels.join("\n  ")}

  <!-- Polar curves (one per TWS), open at the close-hauled top.
       Solid = polar; dashed = VMG projection in the louvoyage zone. -->
  ${curves}

  <!-- Legend: TWS swatches + convention reminder -->
  ${legend}
  ${conventionLegend}

  ${exList}
</svg>
`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function main() {
  if (!fs.existsSync(POLAR_SRC)) {
    console.error(`Polars source dir not found: ${POLAR_SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(POLAR_SRC).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("No polar JSON files found.");
    process.exit(1);
  }

  for (const f of files) {
    const polar = JSON.parse(fs.readFileSync(path.join(POLAR_SRC, f), "utf8"));
    const svg = buildSvg(polar);
    const outPath = path.join(OUT, `${polar.name}.svg`);
    fs.writeFileSync(outPath, svg);
    console.log(`✓ ${path.relative(process.cwd(), outPath)}`);
  }

  console.log(`\nGenerated ${files.length} polar SVGs in ${path.relative(process.cwd(), OUT)}/`);
}

main();
