# Land tiles for the route repair

© les contributeurs d'OpenStreetMap (© OpenStreetMap contributors).

`france.owlt` in this directory is a Derived Database of OpenStreetMap data,
available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See <https://www.openstreetmap.org/copyright>.

It is not covered by the AGPL licence of the code around it.

## What it holds

The land of France and of the coasts around it, as tiles of one world
lattice: spherical Mercator, 655 360 pixels across, a pixel of 61 m at the
equator and about 45 m at 43° N. Latitude 38.27 to 52.05, longitude -10.55
to 12.66: Lisbon to Rotterdam with the south coast of England, Alicante to
Naples with the Balearics, Corsica and Sardinia. The layout of the file is
described in `../land_tiles.py`.

The same script builds the whole world (about 48 MB, too large to ship
here). A deployment that puts that archive in a directory of its own and
names it in `OPENWIND_ROUTE_GRIDS_DIR` repairs routes everywhere.

## How it was made

From the OSM land polygons published by osmdata.openstreetmap.de (split,
EPSG:4326) and the OSM breakwaters, groynes and dams of the area (Overpass),
burnt in with `all_touched`. Built by `scripts/build_land_tiles.py` in this
repository, in November 2026. No bathymetry: the tiles know where the land
is, not where the rocks and shoals are. What OpenStreetMap maps as inland
water behind a closed coastline (a harbour behind its heads, a river above
its mouth) is land here.

The web app's test corpus (`packages/web/tests/fixtures/route-repair/`) is
computed on this file: after rebuilding it, run
`scripts/build_route_parity_corpus.py`.
