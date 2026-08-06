import { describe, expect, it } from "vitest";
import { buildGpx, gpxFilename } from "./exportGpx";
import type { PassageReport, SegmentReport } from "./types";

const WAYPOINTS: [number, number][] = [
  [48.383, -4.4956789],
  [48.35, -4.6],
  [48.293, -4.619],
];

function seg(overrides: Partial<SegmentReport>): SegmentReport {
  return {
    start: { lat: 0, lon: 0 },
    end: { lat: 0, lon: 0 },
    distance_nm: 5,
    bearing_deg: 200,
    start_time: "2026-08-07T09:00:00+02:00",
    end_time: "2026-08-07T10:00:00+02:00",
    tws_kn: 12,
    twd_deg: 270,
    twa_deg: 70,
    polar_speed_kn: 5.5,
    boat_speed_kn: 5.2,
    duration_h: 1,
    hs_m: 0.8,
    wave_derate_factor: 0.95,
    ...overrides,
  };
}

function passage(segments: SegmentReport[]): PassageReport {
  return {
    archetype: "cruiser_30ft",
    departure_time: "2026-08-07T09:00:00+02:00",
    arrival_time: "2026-08-07T11:00:00+02:00",
    duration_h: 2,
    distance_nm: 10.4,
    efficiency: 0.9,
    model: "arome",
    segments,
    warnings: [],
  };
}

const NOW = new Date("2026-08-06T12:00:00Z");

describe("buildGpx — route only", () => {
  const gpx = buildGpx({ waypoints: WAYPOINTS }, NOW);

  it("declares a GPX 1.1 document with the topografix namespace", () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });

  it("emits one rtept per waypoint, coordinates at 6 decimals", () => {
    expect(gpx.match(/<rtept /g)).toHaveLength(3);
    expect(gpx).toContain('lat="48.383000" lon="-4.495679"');
  });

  it("names first/last waypoints Départ/Arrivée, numbers the rest", () => {
    const names = [...gpx.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    expect(names).toContain("Départ");
    expect(names).toContain("WP 2");
    expect(names).toContain("Arrivée");
  });

  it("omits the track when no passage is provided", () => {
    expect(gpx).not.toContain("<trk>");
  });

  it("stamps the export time in metadata", () => {
    expect(gpx).toContain("<time>2026-08-06T12:00:00.000Z</time>");
  });
});

describe("buildGpx — with a simulated passage", () => {
  const segments = [
    seg({
      start: { lat: 48.383, lon: -4.4956789 },
      end: { lat: 48.35, lon: -4.6 },
      start_time: "2026-08-07T09:00:00+02:00",
      end_time: "2026-08-07T10:00:00+02:00",
    }),
    seg({
      start: { lat: 48.35, lon: -4.6 },
      end: { lat: 48.293, lon: -4.619 },
      start_time: "2026-08-07T10:00:00+02:00",
      end_time: "2026-08-07T11:00:00+02:00",
    }),
  ];
  const gpx = buildGpx(
    { waypoints: WAYPOINTS, passage: passage(segments), archetypeLabel: "Croiseur 30 pieds" },
    NOW,
  );

  it("emits segment starts plus the final arrival as trkpt", () => {
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('<trkpt lat="48.293000" lon="-4.619000">');
  });

  it("converts offset timestamps to UTC Z times", () => {
    expect(gpx).toContain("<time>2026-08-07T07:00:00.000Z</time>");
    expect(gpx).toContain("<time>2026-08-07T09:00:00.000Z</time>");
    expect(gpx).not.toContain("+02:00");
  });

  it("summarises distance, duration and archetype in the description", () => {
    expect(gpx).toContain("10,4 nm · 2h");
    expect(gpx).toContain("Croiseur 30 pieds");
  });
});

describe("buildGpx — XML safety", () => {
  it("escapes XML special characters in the archetype label", () => {
    const gpx = buildGpx(
      { waypoints: WAYPOINTS, archetypeLabel: 'Class 40 <"éd." & Co>' },
      NOW,
    );
    expect(gpx).toContain("Class 40 &lt;&quot;éd.&quot; &amp; Co&gt;");
    expect(gpx).not.toContain('<"');
  });
});

describe("gpxFilename", () => {
  it("builds a sortable, extension-correct local-time name", () => {
    // Constructed from local components — build the expectation the same way
    // so the test passes in any timezone.
    const d = new Date(2026, 7, 6, 14, 5);
    expect(gpxFilename(d)).toBe("openwind-route-2026-08-06-1405.gpx");
  });
});
