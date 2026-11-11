# Atlas ouverts pour les tests de sens des courants

Extraits de quelques cellules d'atlas harmoniques construits par OhMyWind, au
format standard (`docs/harmonic_atlas_format.md`), lus par
`tests/currents/test_direction_open.py`. Régénérés par
`scripts/build_test_fixtures_currents.py fixtures --build-dir build` ; le
script refuse un extrait qui change la réponse de la cascade au point testé.

Seules des sources redistribuables sont ici. MARC PREVIMER et SHOM C2D, sous
engagement de non redistribution, n'y sont pas : leurs tests lisent le jeu
de données privé (`test_direction_real_atlas.py`, marqueur `real_atlas`).

Constantes de hauteur des ports de calage (dans `tidal_truth.py`, pas dans ce
dossier) : TICON-4, Hart-Davis, Dettmering, Seitz (DGFI-TUM), SEANOE 2025,
doi:10.17882/109129, CC BY 4.0 ; amplitudes converties en mètres, phases
ramenées à [0, 360[.

## Attributions

- **BSH_AUSALT** (13 cellules) : Data provided by Bundesamt fuer Seeschifffahrt und Hydrographie (BSH), CC BY 4.0. Harmonic constants derived by OhMyWind (changes: harmonic analysis of the forecast series). Licence : CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source : ftp://ftp.bsh.de/Stroemungsvorhersagen/.
- **BSH_CUXBRU** (13 cellules) : Data provided by Bundesamt fuer Seeschifffahrt und Hydrographie (BSH), CC BY 4.0. Harmonic constants derived by OhMyWind (changes: harmonic analysis of the forecast series). Licence : CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source : ftp://ftp.bsh.de/Stroemungsvorhersagen/.
- **GOMOFS_FUNDY** (13 cellules) : Derived from NOAA NOS GOMOFS nowcast fields (NOAA Open Data Dissemination, public domain). Harmonic constants derived by OhMyWind (changes: harmonic analysis of the hourly surface series, C-grid velocities averaged onto rho points and rotated to east / north, nearest-neighbour resampling onto a regular grid); this is not original, unaltered NOAA data and NOAA does not endorse it. Licence : US Government work, public domain (NODD open data) (https://registry.opendata.aws/noaa-ofs/). Source : https://noaa-nos-ofs-pds.s3.amazonaws.com/gomofs/netcdf/.
- **NORKYST_TRONDELAG** (12 cellules) : Data from the Norwegian Meteorological Institute (MET Norway), NorKyst v3 800 m, CC BY 4.0. Harmonic constants derived by OhMyWind (changes: harmonic analysis of the hourly surface series, nearest-neighbour resampling onto a regular grid). Licence : CC BY 4.0 (and NLOD) (https://www.met.no/en/free-meteorological-data/Licensing-and-crediting). Source : https://thredds.met.no/thredds/dodsC/fou-hi/norkystv3_800m_m00_be.
