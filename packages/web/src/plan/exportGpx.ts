// GPX 1.1 export of the planned route. Export-only by design: OpenWind never
// imports GPX — an imported track with hundreds of points would bypass the
// waypoint-count expectations of plan_passage. The generated file re-imports
// cleanly into OpenCPN, qtVlm and Garmin/Navionics chartplotters:
// - `<rte>` carries the user's waypoints (the navigable route),
// - `<trk>` (only when a fresh simulation exists) carries the time-stamped
//   trace so the ETAs survive the round-trip.

import type { PassageReport } from "./types";
import { fmtDuration, fr1 } from "./format";

export interface GpxExportInput {
  waypoints: [number, number][];
  /** Fresh single-mode simulation matching `waypoints`. Null/undefined →
   *  route-only export (no `<trk>`), e.g. compare mode or stale results. */
  passage?: PassageReport | null;
  /** Human label of the boat archetype, embedded in the route description. */
  archetypeLabel?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 6 decimals ≈ 0.1 m — beyond any nautical relevance, and stable output for
// tests regardless of how many decimals the Leaflet click produced.
function coord(n: number): string {
  return n.toFixed(6);
}

// GPX `<time>` must be UTC (Z suffix); server timestamps carry an offset.
function isoUtc(iso: string): string {
  return new Date(iso).toISOString();
}

function wptName(i: number, total: number): string {
  if (i === 0) return "Départ";
  if (i === total - 1) return "Arrivée";
  return `WP ${i + 1}`;
}

/** Pure GPX 1.1 document builder — DOM-free so it stays unit-testable. */
export function buildGpx({ waypoints, passage, archetypeLabel }: GpxExportInput, now: Date = new Date()): string {
  const descParts = [
    passage ? `${fr1(passage.distance_nm)} nm · ${fmtDuration(passage.duration_h)}` : null,
    archetypeLabel ?? null,
    "Estimation OpenWind — pas une aide à la navigation.",
  ].filter((p): p is string => p != null);

  const rtepts = waypoints
    .map(
      ([lat, lon], i) =>
        `    <rtept lat="${coord(lat)}" lon="${coord(lon)}">\n` +
        `      <name>${esc(wptName(i, waypoints.length))}</name>\n` +
        `    </rtept>`,
    )
    .join("\n");

  // The simulated trace: one point per computed segment start, plus the final
  // arrival point. Denser than the user's waypoints when the server sampled
  // the corridor; each point carries the simulated passing time.
  let trk = "";
  if (passage && passage.segments.length > 0) {
    const pts = passage.segments.map(
      (s) =>
        `      <trkpt lat="${coord(s.start.lat)}" lon="${coord(s.start.lon)}">\n` +
        `        <time>${isoUtc(s.start_time)}</time>\n` +
        `      </trkpt>`,
    );
    const last = passage.segments[passage.segments.length - 1];
    pts.push(
      `      <trkpt lat="${coord(last.end.lat)}" lon="${coord(last.end.lon)}">\n` +
        `        <time>${isoUtc(last.end_time)}</time>\n` +
        `      </trkpt>`,
    );
    trk =
      `\n  <trk>\n` +
      `    <name>Simulation OpenWind</name>\n` +
      `    <trkseg>\n${pts.join("\n")}\n    </trkseg>\n` +
      `  </trk>`;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="OpenWind — openwind.fr"` +
    ` xmlns="http://www.topografix.com/GPX/1/1"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n` +
    `  <metadata>\n` +
    `    <name>Route OpenWind</name>\n` +
    `    <desc>${esc(descParts.join(" · "))}</desc>\n` +
    `    <link href="https://openwind.fr"><text>OpenWind</text></link>\n` +
    `    <time>${now.toISOString()}</time>\n` +
    `  </metadata>\n` +
    `  <rte>\n` +
    `    <name>Route OpenWind</name>\n${rtepts}\n` +
    `  </rte>${trk}\n` +
    `</gpx>\n`
  );
}

/** "openwind-route-2026-08-06-1430.gpx" — local time, sortable, no spaces. */
export function gpxFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `openwind-route-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.gpx`;
}

/** Build the GPX and hand it to the browser as a file download. */
export function downloadGpx(input: GpxExportInput): void {
  const blob = new Blob([buildGpx(input)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = gpxFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
