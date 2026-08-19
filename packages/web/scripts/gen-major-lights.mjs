// Regenerates the major-lights dataset drawn over the OpenSeaMap raster.
//
// Why a shipped dataset rather than a live query: the whole French coast is
// a couple of hundred nodes, so it costs less to bundle than one Overpass
// round trip would cost to wait for, and it works offline like the rest of
// the app shell.
//
// What counts as a lighthouse here, and why it is not just
// ``seamark:type=light_major``: OSM tagging does not follow the
// hydrographic classification closely enough to use it alone. The Île de
// Brescou light off Cap d'Agde carries 13 M and is tagged ``light_minor``,
// so a light_major-only layer would leave the Agde landfall as a 9 px speck
// next to enlarged neighbours, which is exactly the inconsistency this
// layer exists to remove.
//
// So a node qualifies when it is tagged ``light_major``, OR when it is a
// lighthouse structure (``man_made=lighthouse`` or a lighthouse landmark)
// whose light carries 10 M or more. That range is what separates a landfall
// light from a pierhead light in practice: it keeps Brescou at 13 M and
// drops the Grau d'Agde jetty heads at 7 M.
//
// Light vessels are excluded even when they qualify on range: a lightship
// has its own chart symbol, and drawing it as a lighthouse star would say
// the wrong thing about what is out there.
//
// Run with:  node packages/web/scripts/gen-major-lights.mjs
// Overpass is rate-limited, so the boxes are queried one at a time with a
// pause. Expect roughly a minute.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/data/majorLights.ts");

const ENDPOINT = "https://overpass-api.de/api/interpreter";

// The French coast in four boxes rather than one: a single envelope over
// Manche + Atlantique + Méditerranée also swallows most of the British,
// Spanish and Italian coasts, and Overpass times out on the area.
const BOXES = {
  Manche: "48.9,-2.2,51.2,2.7",
  Bretagne: "47.0,-5.6,49.0,-1.0",
  Gascogne: "43.2,-2.6,47.1,0.2",
  "Méditerranée + Corse": "41.2,2.5,44.1,9.9",
};

/** Range in nautical miles, taking the strongest sector when a light is
    split into several. Absent on plenty of nodes, hence the null. */
function nominalRangeNm(tags) {
  const ranges = Object.entries(tags)
    .filter(([k]) => k.startsWith("seamark:light") && k.endsWith(":range"))
    .map(([, v]) => Number(v))
    .filter((n) => Number.isFinite(n));
  return ranges.length ? Math.max(...ranges) : null;
}

/** 10 M is where a landfall light parts company with a pierhead light. */
const LANDFALL_RANGE_NM = 10;

function isLighthouse(tags) {
  if (tags["seamark:type"] === "light_vessel") return false;
  if (tags["seamark:type"] === "light_major") return true;
  const range = nominalRangeNm(tags);
  return range !== null && range >= LANDFALL_RANGE_NM;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(bbox) {
  const body =
    `[out:json][timeout:240];(` +
    `node["seamark:type"="light_major"](${bbox});` +
    `node["man_made"="lighthouse"](${bbox});` +
    `node["seamark:landmark:category"="lighthouse"](${bbox});` +
    `);out body;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      body,
      headers: { "User-Agent": "ohmywind-gen-major-lights" },
    });
    if (res.ok) return (await res.json()).elements;
    // 429 and 504 are the normal answers to a burst on the public instance,
    // not failures. Back off and retry.
    await sleep(25000);
  }
  throw new Error(`Overpass refused the box ${bbox} after 6 attempts`);
}

const byId = new Map();
for (const [name, bbox] of Object.entries(BOXES)) {
  const elements = await query(bbox);
  const kept = elements.filter((el) => isLighthouse(el.tags));
  console.log(
    `${name.padEnd(22)} ${String(kept.length).padStart(4)} phares` +
      ` (sur ${elements.length} candidats)`,
  );
  // The boxes overlap at the corners, so de-duplicate on the OSM node id.
  for (const el of kept) byId.set(el.id, el);
  await sleep(8000);
}

// Sorted north to south so the generated file has a stable order: a refresh
// that adds one light should show as one added line, not a reshuffle.
const lights = [...byId.values()]
  .sort((a, b) => b.lat - a.lat || a.lon - b.lon)
  // 5 decimals is ~1 m, far finer than anything this layer draws, and it
  // keeps the file diffable.
  .map((el) => [Number(el.lat.toFixed(5)), Number(el.lon.toFixed(5))]);

// Two OSM nodes sometimes sit on the exact same point, typically a
// structure mapped once as a lighthouse and once as its light. Stacking two
// identical stars costs a marker and renders as one anyway.
// Leading-light pairs a few dozen metres apart are NOT merged: they are two
// real lighthouses, and they only blend at the zooms where blending is the
// honest picture.
const seen = new Set();
const unique = lights.filter(([lat, lon]) => {
  const key = `${lat},${lon}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
if (unique.length !== lights.length) {
  console.log(`${lights.length - unique.length} doublon(s) de position écarté(s)`);
}

const header = `// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// GENERATED FILE — do not edit by hand.
// Run \`node packages/web/scripts/gen-major-lights.mjs\` to refresh.
//
// Lighthouses from OpenStreetMap, under ODbL: everything tagged
// \`seamark:type=light_major\`, plus any lighthouse structure whose light
// carries 10 M or more, which is what separates a landfall light from a
// pierhead light. Light vessels are left out, they have their own symbol.
//
// The boxes are cut around the French coast and keep the facing shores they
// overlap: the English side of the Channel and the Spanish and Italian ends
// of the Mediterranean box. A Channel crossing wants the landfall lights on
// both sides, so they are kept rather than clipped.
//
// Positions only: the layer draws a symbol, and carrying names nothing
// renders would be dead weight.
//
// Drawn as vectors over the OpenSeaMap raster because the raster cannot be
// resized. Its symbols are baked at one size per tile, so zoomed out to a
// whole coast a landfall light is a 9 px speck, which is the one zoom where
// it matters most.

/** [latitude, longitude], north to south. */
export const MAJOR_LIGHTS: readonly (readonly [number, number])[] = [
`;

const body = unique.map(([lat, lon]) => `  [${lat}, ${lon}],`).join("\n");
fs.writeFileSync(OUT, `${header}${body}\n];\n`);
console.log(`\n${unique.length} phares écrits dans ${path.relative(process.cwd(), OUT)}`);
