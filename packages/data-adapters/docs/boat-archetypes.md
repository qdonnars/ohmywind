# Boat archetypes — V1 polars and assumptions

OhMyWind ships 7 archetypes covering the bulk of French cruising fleets, from
small trailerable cruisers to bluewater 50-footers and a racer-cruiser.
The LLM client is expected to map a user's commercial boat name (e.g. *"Sun
Odyssey 32"*) onto the closest archetype using the fields exposed by
`list_archetypes()` — there is no server-side mapping table.

## Archetypes

| Name              | Length | Type      | Category       | Performance class | Indicative models                                      |
|-------------------|--------|-----------|----------------|-------------------|--------------------------------------------------------|
| `cruiser_20ft`    | 20 ft  | monohull  | cruising       | slow              | Beneteau First 210, Catalina 22, Jeanneau Tonic 23, Sun 2000 |
| `cruiser_25ft`    | 25 ft  | monohull  | cruising       | slow              | Beneteau First 25, Catalina 25, Sun Odyssey 24, Oceanis 251  |
| `cruiser_30ft`    | 30 ft  | monohull  | cruising       | slow              | Sun Odyssey 32, Bavaria 31, Beneteau Oceanis 31        |
| `cruiser_40ft`    | 40 ft  | monohull  | cruising       | average           | Sun Odyssey 410, Bavaria 41 Cruiser, Hanse 418         |
| `cruiser_50ft`    | 50 ft  | monohull  | cruising       | fast              | Sun Odyssey 519, Bavaria C50, Hanse 508                |
| `catamaran_40ft`  | 40 ft  | catamaran | cruising       | fast-reach        | Lagoon 40, Bali 4.1, Fountaine Pajot Lucia 40          |
| `racer_cruiser`   | 40 ft  | monohull  | racer-cruiser  | very-fast         | J/122, Pogo 12.50, Solaris 40, Grand Soleil 43         |

## Polar grid

Each polar is a 8 × 9 table of boat speeds (kn) on:

- TWS (true wind speed): 6, 8, 10, 12, 14, 16, 20, 25 kn
- TWA (true wind angle): 40, 50, 60, 75, 90, 110, 135, 150, 165 deg

`lookup_polar` performs bilinear interpolation inside the grid and clamps to
edges outside (TWS < 6 kn or > 25 kn → use the nearest row; TWA < 40° or > 165°
→ use the nearest column). Polars are symmetric around the wind axis: `TWA` is
always passed in `[0, 180]` (port and starboard tacks are not distinguished in
V1).

## Efficiency factor (default 0.75)

The boat speeds in the polar JSONs are nominal **theoretical maxima**, in the
spirit of an ORC certificate. Real-world cruising rarely sustains these because
of:

1. **Sail trim & comfort**: cruisers reef earlier, fly smaller headsails, and
   accept a few degrees of helm slack to reduce noise and motion.
2. **Sea state**: choppy seas on the bow cost both speed and comfort. V1 does
   not model wave-driven slowdown explicitly — the efficiency factor absorbs it.
3. **Currents**: the Liguro-Provençal current is weak (0.1–0.5 kn) and ignored.
4. **Helmsman / autopilot losses**: small angle excursions cost VMG.
5. **Fouling, sail age, calibration**: real polars degrade over a season.

The default `efficiency = 0.75` corresponds to "average cruising" sailors based
on user-reported polars vs. measured logs in the Mediterranean. Override per
call:

- `0.65` — heavy cruiser, family mode, comfort priority
- `0.75` — default, balanced cruising
- `0.85` — attentive crew, well-trimmed boat, light/clean conditions
- `0.95–1.0` — racing crew on a well-prepared boat

This single number is intentionally coarse. V2 may split it into upwind /
downwind / sea-state-dependent factors.

## Single-pass timing approximation

`estimate_passage` does **not** iterate to convergence on segment timings. It
computes each segment's mid-time using a constant heuristic speed (6 kn), fetches
wind at that timestamp, and accumulates true durations. The bias is bounded
because:

- For typical Mediterranean passages (≤ 24 h), wind forecasts vary on 6–12 h
  timescales — being off by an hour or two on a segment's mid-time rarely
  changes the wind regime.
- Under constant wind (in time), the bias is exactly zero.

If V2 needs more precision, swap to a 2-pass algorithm: first pass with the
heuristic speed, second pass with the speeds computed in pass 1.
