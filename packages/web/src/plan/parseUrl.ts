export interface ParsedPlanParams {
  waypoints: [number, number][];
  departure: string;
  archetype: string;
}

export type ParseResult = ParsedPlanParams | { error: string };

export function parsePlanUrl(search: string): ParseResult {
  const p = new URLSearchParams(search);
  const wpts = p.get("wpts");
  const departure = p.get("departure") ?? "";
  const archetype = p.get("archetype") ?? "";

  // No wpts at all → fresh empty plan (valid, not an error)
  if (!wpts) return { waypoints: [], departure, archetype };

  try {
    const parts = wpts.split(";").filter(Boolean);
    if (parts.length < 2) return { error: "Au moins 2 waypoints requis" };
    const waypoints = parts.map((wp): [number, number] => {
      const [latStr, lonStr] = wp.split(",");
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) throw new Error(`waypoint invalide: "${wp}"`);
      if (lat < -90 || lat > 90) throw new Error(`latitude hors plage: ${lat}`);
      if (lon < -180 || lon > 180) throw new Error(`longitude hors plage: ${lon}`);
      return [lat, lon];
    });
    return { waypoints, departure, archetype };
  } catch (e) {
    return { error: `Waypoints invalides: ${e instanceof Error ? e.message : e}` };
  }
}

export function isParsedOk(r: ParseResult): r is ParsedPlanParams {
  return !("error" in r);
}

export function buildPlanUrl(
  waypoints: [number, number][],
  departure: string,
  archetype: string
): string {
  const wpts = waypoints.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(";");
  return `/plan?wpts=${wpts}&departure=${encodeURIComponent(departure)}&archetype=${encodeURIComponent(archetype)}`;
}
