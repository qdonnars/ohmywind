import type { PlaceResult } from "./places";
import { dedupePlaces, withDistances } from "./places";

/**
 * Place search for a sailing planner.
 *
 * Photon is the primary source: it is keyless, it accepts a lat/lon bias so
 * ranking happens server-side, and it indexes OpenStreetMap, which knows the
 * maritime vocabulary a planner needs. A search for "Raz de Sein" or "Goulet
 * de Brest" returns nothing at all from a populated-places gazetteer.
 *
 * Open-Meteo stays wired as a fallback. Photon's public instance carries no
 * service commitment, and a search box that dies with it would be worse than
 * one that quietly degrades to the previous behaviour.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";
const OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * OSM keys worth surfacing. Without this filter Photon answers "Le Palais"
 * with a chinese restaurant and a butcher's shop: it indexes every POI, so
 * narrowing to places and natural or navigable features is not optional.
 */
const OSM_TAGS = ["place", "waterway", "natural"];

/** Over-fetch so dedup and re-ranking have material to work with. */
const FETCH_LIMIT = 20;
/** How many rows the dropdown shows. */
const DISPLAY_LIMIT = 8;
/** Past this, fall back rather than leave the user watching a spinner. */
const TIMEOUT_MS = 3500;

interface PhotonProperties {
  name?: string;
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
}

/**
 * French labels for the feature kinds that carry no administrative parent.
 * A fairway or a strait sits offshore, so Photon returns no county and no
 * state: without this the dropdown would show a bare name with no context.
 */
const FEATURE_LABELS: Record<string, string> = {
  "waterway:fairway": "Chenal",
  "natural:strait": "Passage",
  "natural:cape": "Cap",
  "natural:bay": "Baie",
  "natural:reef": "Récif",
  "natural:shoal": "Haut-fond",
  "natural:peninsula": "Presqu'île",
  "natural:beach": "Plage",
  "place:island": "Île",
  "place:islet": "Îlot",
  "place:archipelago": "Archipel",
};

/** Second line of a result row. Pure, so the fallback chain is testable. */
export function photonContext(props: PhotonProperties): string {
  const feature = FEATURE_LABELS[`${props.osm_key}:${props.osm_value}`];
  const admin = props.county || props.state || props.city || props.country;
  if (feature && admin) return `${feature}, ${admin}`;
  if (feature) return feature;
  return admin || "";
}

interface PhotonFeature {
  properties: PhotonProperties;
  geometry: { coordinates: [number, number] };
}

/** Photon GeoJSON → our rows. Unnamed features are dropped: they would
    render as an empty line the user cannot act on. */
export function mapPhotonResults(features: PhotonFeature[]): PlaceResult[] {
  return features
    .filter((f) => f.properties?.name)
    .map((f) => ({
      id: `photon:${f.properties.osm_type ?? "?"}${f.properties.osm_id ?? Math.random()}`,
      name: f.properties.name as string,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      context: photonContext(f.properties),
      source: "photon" as const,
    }));
}

interface OpenMeteoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export function mapOpenMeteoResults(results: OpenMeteoResult[]): PlaceResult[] {
  return results.map((r) => ({
    id: `om:${r.id}`,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    context: [r.admin1, r.country].filter(Boolean).join(", "),
    source: "openmeteo" as const,
  }));
}

export function buildPhotonUrl(
  query: string,
  near: { lat: number; lon: number } | null | undefined,
): string {
  const params = new URLSearchParams({
    q: query,
    limit: String(FETCH_LIMIT),
    lang: "fr",
  });
  for (const tag of OSM_TAGS) params.append("osm_tag", tag);
  if (near) {
    params.set("lat", near.lat.toFixed(4));
    params.set("lon", near.lon.toFixed(4));
  }
  return `${PHOTON_URL}?${params}`;
}

/** Abort on either the caller's signal or our own timeout, without relying
    on AbortSignal.any which is too recent to assume in every browser. */
function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

async function searchPhoton(
  query: string,
  near: { lat: number; lon: number } | null | undefined,
  signal: AbortSignal | undefined,
): Promise<PlaceResult[]> {
  const { signal: timedSignal, cleanup } = withTimeout(signal, TIMEOUT_MS);
  try {
    const res = await fetch(buildPhotonUrl(query, near), { signal: timedSignal });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const data = await res.json();
    return mapPhotonResults(data.features ?? []);
  } finally {
    cleanup();
  }
}

async function searchOpenMeteo(
  query: string,
  signal: AbortSignal | undefined,
): Promise<PlaceResult[]> {
  const url = `${OPEN_METEO_URL}?name=${encodeURIComponent(query)}&count=${FETCH_LIMIT}&language=fr`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = await res.json();
  return mapOpenMeteoResults(data.results ?? []);
}

export interface SearchOptions {
  /** Reference point for the proximity bias and the displayed distances. */
  near?: { lat: number; lon: number } | null;
  signal?: AbortSignal;
}

export async function searchPlaces(
  query: string,
  { near, signal }: SearchOptions = {},
): Promise<PlaceResult[]> {
  let results: PlaceResult[];
  try {
    results = await searchPhoton(query, near, signal);
  } catch (err) {
    // A cancelled request is the caller superseding it, not a failure:
    // falling back would race the newer query and could overwrite it.
    if (signal?.aborted) throw err;
    results = await searchOpenMeteo(query, signal);
  }
  return dedupePlaces(withDistances(results, near)).slice(0, DISPLAY_LIMIT);
}
