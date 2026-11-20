# Shoreline grids for the route repair

© les contributeurs d'OpenStreetMap (© OpenStreetMap contributors).

The three files in this directory (`bsud.npz`, `manche.npz`, `provence.npz`)
are a Derived Database of OpenStreetMap data, available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See <https://www.openstreetmap.org/copyright>.

They are not covered by the AGPL licence of the code around them.

## What they hold

One land raster per region, square pixels of about 45 m, packed along rows
(row 0 at the south edge): `land` is the packed bitmap, `meta` is
`lat0, lon0, dlat, dlon, n_lat, n_lon`.

| File | Region | Latitude | Longitude |
|---|---|---|---|
| `bsud.npz` | Bretagne sud and Vendée, Brest to La Rochelle and Yeu | 46.0 to 48.5 | -4.9 to -1.0 |
| `manche.npz` | Manche ouest and the Channel Islands, Saint-Malo to Cherbourg | 48.55 to 49.8 | -3.0 to -1.0 |
| `provence.npz` | Provence, Port-Camargue to Le Lavandou | 42.9 to 43.65 | 3.8 to 6.8 |

## How they were made

From the OSM land polygons published by osmdata.openstreetmap.de (split,
EPSG:4326) and the OSM breakwaters, groynes and dams of each region
(Overpass), burnt in with `all_touched`. Built by
`scripts/spike_auto_route/build_repair_grids.py` in this repository, built
in November 2026. No bathymetry: the grids know
where the land is, not where the rocks and shoals are.
