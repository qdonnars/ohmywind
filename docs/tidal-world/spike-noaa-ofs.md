# Spike NOAA OFS : la Salish Sea à 200 m par SSCOFS

Exploration du 2026-09-21, livrée sur la branche `feat/norkyst-spike` avec le spike NorKyst, en
lecture seule (rien de publié, rien de poussé). Question : les Operational
Forecast Systems du National Ocean Service (NOAA), publiés sans clé sur le
seau AWS Open Data `noaa-nos-ofs-pds`, peuvent-ils alimenter, par analyse
harmonique, un atlas de courants de marée au format standard, comme
`build_norkyst_atlas.py` le fait pour NorKyst et `build_cmems_atlas.py`
pour Copernicus ? Bout à bout sur **SSCOFS** (Salish Sea and Northwest
Straits, FVCOM non structuré, horaire) et une boîte de 1,3° × 1° autour
d'Admiralty Inlet, Deception Pass et Tacoma Narrows (47,2° à 48,5° N,
−123,2° à −122,2° E), puis extrapolation aux autres systèmes du seau.

Réponse courte : oui, et c'est la source la mieux placée de toute la
cascade. SSCOFS est dans le seau, en fichiers NetCDF-4 **non compressés**
de 210 Mo par heure (tout le domaine, 3D) ; comme les blocs HDF5 sont à des
octets fixes, la couche de surface de `u` et `v` se lit par requêtes
`Range` à 5 Mo par heure au lieu de 210 : **32 jours téléchargés en
23,5 minutes (4,0 Go sur le fil, 1,0 Go sur disque), analyse en 13 s,
atlas de 15 Mo** pour 92 322 cellules de 200 m. Contre huit stations de
courant CO-OPS de la boîte, le demi-grand axe M2 sort à 0,77 à 1,22 fois
la valeur publiée (0,67 à Deception Pass, où la passe fait deux éléments
de large), les phases à 16° près, et les maxima reconstruits à 0,84 à 0,97
fois les maxima de flot et de jusant publiés à Bush Point, aux Narrows et à
Rosario, 1,28 à Point Wilson, 0,68 à 0,70 dans les deux passes étroites et
à West Point. Les 32 jours d'un équinoxe ne séparent ni K2 de S2 ni P1 de K1,
FES2014 ne répond pas au centre du domaine (Puget Sound est de la terre à
1/16°), mais les constituants publiés par CO-OPS à une station remplacent
FES pour l'inférence et ramènent S2 exactement sur la valeur publiée. La
licence est le domaine public du gouvernement fédéral américain. Au rang 2
(côtier, 200 m), avec `confidence medium` jusqu'à validation plus large et
le garde-fou des passes non résolues pour Deception Pass et Agate Passage.

Chaque affirmation est **[vérifié]** (commande, fichier ou URL reproductible
le 2026-09-21) ou **[supposé]**.

## 1. Accès et licence

- **Deux seaux S3 publics, sans clé** [vérifié le 2026-09-21 sur
  <https://registry.opendata.aws/noaa-ofs/>] : `noaa-ofs-pds` (« NOMADS
  Production OFS Data », rétention glissante de 30 jours) et
  `noaa-nos-ofs-pds` (« CO-OPS Operational OFS Data (Historical
  Retention) »), région `us-east-1`, accès `--no-sign-request`. Tout le
  spike lit le second par HTTPS nu :
  `https://noaa-nos-ofs-pds.s3.amazonaws.com/?list-type=2&prefix=...` pour
  lister, `GET` avec en-tête `Range` sur l'objet pour lire. Ni `boto3` ni
  la CLI `aws` ne sont nécessaires.
- **Vingt-deux préfixes système à la racine** [vérifié par le listing] :
  `cbofs`, `ciofs`, `creofs`, `dbofs`, `glofs`, `gomofs`, `leofs`, `lmhofs`,
  `loofs`, `lsofs`, `necofs`, `negofs`, `ngofs`, `ngofs2`, `nwgofs`, `nyofs`,
  `sfbofs`, `sjrofs`, `sscofs`, `tbofs`, `wcofs`, `wcofs_da`, plus
  `OFS_Grid_Datum/` (grilles et datums verticaux : `cbofs.romsgrid.nc`,
  `ciofs.romsgrid.nc`, `creofs.2dm`, `*_vdatums.nc`) et `last7days/`.
  Sous chaque système : `<sys>/netcdf/AAAA/MM/JJ/` (nouveau nommage) et,
  pour l'historique, `<sys>/netcdf/AAAAMM/` (SSCOFS : `202409` à `202412`,
  puis `2025/` et `2026/`).
- **Nommage des fichiers** [vérifié sur le listing du 2026-09-10 et sur la
  page CO-OPS <https://tidesandcurrents.noaa.gov/ofs/sscofs/sscofs.html>,
  encart « Notice of NOS OFS product changes », en vigueur depuis août
  2024] : `<sys>.tCCz.AAAAMMJJ.<produit>.[n|f]HHH.nc` avec `CC` le cycle,
  `n` pour nowcast et `f` pour forecast, `HHH` l'heure ; produits `fields`
  (3D, grille native), `2ds` (2D surface, grille native, seulement pour
  GoMOFS, NGOFS2 et WCOFS), `regulargrid` (3D interpolé sur grille
  régulière), `stations.[nowcast|forecast].nc`. SSCOFS tourne quatre cycles
  par jour à 03, 09, 15 et 21 UTC ; chaque cycle publie `n000` à `n006`
  (`n000` répète la dernière heure du cycle précédent, `n001` à `n006`
  couvrent les six heures qui précèdent le cycle : l'attribut `time` de
  `t03z n001` vaut 22:00 la veille [vérifié]) et `f000` à `f072`. Les
  heures de prévision ne sont jamais lues. Sur les 36 jours listés du
  2026-08-17 au 2026-09-21, chaque jour complet a ses 4 × 7 fichiers
  nowcast, tous de 210 525 170 octets [vérifié].
- **OPeNDAP** [vérifié] : le THREDDS CO-OPS
  `https://opendap.co-ops.nos.noaa.gov/thredds/` sert chaque fichier
  (`dodsC/NOAA/SSCOFS/MODELS/2026/09/20/sscofs.t21z.20260920.fields.n001.nc`)
  et des agrégats seulement pour CBOFS, CIOFS, DBOFS, GoMOFS, NYOFS,
  SJROFS et TBOFS (`*_agg.html`), pas pour SSCOFS. Sur un maillage non
  structuré, un hyperslab OPeNDAP ne sait pas extraire une boîte (les
  171 018 éléments de la boîte s'étalent sur les indices 86 056 à 422 626,
  soit la moitié du tableau, section 4), donc le spike ne s'en sert que
  pour lire les dimensions et quelques coordonnées des autres systèmes
  (`.dds`, `.ascii`, section 6).
- **Licence** [vérifié le 2026-09-21, textes lus in extenso] :
  - <https://registry.opendata.aws/noaa-ofs/>, rubrique « License » :
    « NOAA data disseminated through NODD are open to the public and can
    be used as desired. NOAA makes data openly available to ensure maximum
    use of our data, and to spur and encourage exploration and innovation
    throughout the industry. NOAA requests attribution for the use or
    dissemination of unaltered NOAA data. However, it is not permissible
    to state or imply endorsement by or affiliation with NOAA. If you
    modify NOAA data, you may not state or imply that it is original,
    unaltered NOAA data. » ;
  - <https://tidesandcurrents.noaa.gov/disclaimers.html>, « Use of Data and
    Products » : « The information on government servers are in the public
    domain, unless specifically annotated otherwise, and may be used freely
    by the public. [...] NOS requests that attribution be given whenever
    NOS material is reproduced and re-disseminated. Pursuant to 17 U.S.C.
    403, third parties producing copyrighted (compilation) works
    consisting predominantly of material created by Federal Government
    employees are encouraged to provide notice [...] ».
  - Conclusion : œuvre du gouvernement fédéral américain, domaine public ;
    le dérivé est redistribuable sans condition, l'attribution est
    demandée, et l'atlas doit dire qu'il est modifié et non endossé par la
    NOAA. C'est le régime le plus simple de toute la cascade. Les deux
    textes sont dans `metadata.json` (`source.licence.evidence`) et la
    phrase « this is not original, unaltered NOAA data and NOAA does not
    endorse it » dans `source.attribution`.

## 2. Jeu de données et variables [vérifié par h5py et netCDF4 sur `sscofs.t03z.20260910.fields.n001.nc`]

| Élément | Valeur |
|---|---|
| Modèle | FVCOM 4.4.7 (attribut `source`), institution « School for Marine Science and Technology » (UMass Dartmouth), titre `SSCOFS`, `CoordinateProjection proj=utm +ellps=WGS84 +zone=10`, Conventions CF-1.0 |
| Maillage | 433 410 triangles (`nele`), 239 734 nœuds (`node`), connectivité `nv[3, nele]` (base 1), centroïdes `lonc` / `latc` float32 avec **longitudes en 0 à 360°** (230,5 à 238,0 ; converties par le script) |
| Emprise | 44,40° à 52,10° N, −129,49° à −121,96° E : Salish Sea entière (Juan de Fuca, San Juan, Géorgie, Puget Sound), estuaire et fleuve Columbia, large jusqu'à 130° W ; la page CO-OPS parle de « 9 subdomains » dont trois pour le Columbia |
| Verticale | 10 couches sigma généralisées, `siglay[10, node]` ; couche 0 centrée à −0,0158 de la profondeur locale (1,6 m par 100 m d'eau), `siglev` de 0 à −1 ; profondeur `h[node]` de −8,9 à 2 018 m |
| Courants | `u`, `v` `[time=1, siglay=10, nele]` float32 m/s, `standard_name eastward/Northward_sea_water_velocity`, sur les centroïdes ; **pas de `ua` / `va`** (moyenne verticale) dans les fichiers `fields` |
| Autres | `zeta[time, node]`, `temp`, `salinity`, `wet_cells[time, nele]` et `wet_nodes` (int32, 0 à sec), flux de chaleur, vent, pression, `tauc`, `omega`, `ww` |
| Temps | un instant par fichier, `time` float64 « seconds since 2018-01-01 00:00:00 », `Times` en clair ; forçage de marée par série temporelle aux frontières ouvertes (attribut `Tidal_Forcing`), 38 rivières |
| Stockage | NetCDF-4 (HDF5), **aucune compression** ; `u` et `v` en blocs `[1, 4, 144470]` (9 blocs de 2,3 Mo par variable), `wet_cells` en un bloc de 1,7 Mo, `time` en un bloc de 4 Ko ; les trois blocs de la couche 0 à 3 de `u` sont contigus à partir de l'octet 97 566 290, ceux de `v` à partir de 118 373 106, et dans chaque bloc la couche 0 occupe les 577 880 premiers octets |
| Sortie régulière | `regulargrid.*.nc` de 1 683 Mo par heure (non lue) ; `stations.nowcast.nc` de 4,2 Mo par cycle (non lue) |

Ce que le script fait de cette structure [vérifié dans
`scripts/build_ofs_atlas.py`] : un fichier entier sert de gabarit (h5py lit
les offsets de bloc par `get_chunk_info`, les centroïdes, la connectivité,
les profondeurs) ; ensuite chaque heure coûte huit requêtes `Range` (`time`
sur 8 octets, trois tranches de 578 Ko pour `u`, trois pour `v`,
`wet_cells` sur 1,7 Mo), soit 5,2 Mo au lieu de 210. Chaque fichier est
accepté par sa taille (`Content-Range`) et par l'horodatage lu à l'offset
du gabarit, qui doit être l'heure attendue à la seconde près ; sinon le
fichier est téléchargé entier et lu par netCDF4 (chemin jamais emprunté sur
les 768 heures, colonne « 0 whole » du journal). Les éléments à sec
(`wet_cells = 0`) passent à NaN : 9 096 des 171 018 éléments de la boîte
sont à sec au moins une heure sur la première journée, 15 en permanence.

## 3. Volumes mesurés [vérifié, `build/ofs/sscofs/download.log` et `build.log`]

Boîte 47,2° à 48,5° N, −123,2° à −122,2° E (Admiralty Inlet, Deception
Pass, Tacoma Narrows, Seattle, Hood Canal, San Juan sud) :

- gabarit `sscofs.t03z.20260910.fields.n001.nc` : **210 Mo en 9 s**
  (23,5 Mo/s) ;
- **171 018 éléments dans la boîte** sur 433 410 (39 % du maillage, la
  partie la plus fine), 171 003 en eau sur les 48 premières heures ;
- 32 jours du 2026-08-19 au 2026-09-19 (768 instants, du 2026-08-18 22:00
  au 2026-09-19 21:00 UTC), couche sigma 0, `u`, `v`, `wet_cells` : **32
  fichiers de 31,0 à 31,1 Mo, 993 Mo au total** (float32, zlib 4) ;
- **1 411 s de transfert cumulé (23,5 min), 41 à 46 s par jour, 125 Mo
  fetchés par jour (4,0 Go au total), 192 requêtes par jour** avec 0,2 s
  de pause entre les heures, aucun échec, aucune relance, aucune heure
  manquante (le script prévoit 6 essais à délai doublé) ; le débit
  effectif de 2,8 Mo/s est borné par la latence, 0,23 s par requête ;
- analyse harmonique : **12,8 s** pour 171 003 cellules × 768 h × 2
  composantes (13 constituants résolus, 4 inférés dans la variante
  CO-OPS) ;
- atlas `SSCOFS_SALISH` : **92 322 cellules à 0,2 kt ou plus, 9 tuiles de
  0,5°, 15,4 Mo** (167 octets par cellule ; 19,7 Mo et 92 122 cellules pour
  la variante avec inférence, 17 constituants).

Commandes (depuis la racine du dépôt, le `--template-key` réutilise le
gabarit déjà téléchargé ; sans lui, le script prend la première heure de
la période) :

```
env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --download --no-build --system sscofs --start 2026-08-19 --days 32 \
  --bbox 47.2 -123.2 48.5 -122.2 --source-dir build/ofs/sscofs --zone salish \
  --template-key sscofs/netcdf/2026/09/10/sscofs.t03z.20260910.fields.n001.nc

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --system sscofs --source-dir build/ofs/sscofs --zone salish \
  --atlas-id SSCOFS_SALISH --output-dir build/ofs/sscofs/atlas/SSCOFS_SALISH \
  --bbox 47.2 -123.2 48.5 -122.2 --reference-atlas-dir build/fes/atlas --confidence medium

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --system sscofs --source-dir build/ofs/sscofs --zone salish \
  --atlas-id SSCOFS_SALISH --output-dir build/ofs/sscofs/atlas_harcon/SSCOFS_SALISH \
  --bbox 47.2 -123.2 48.5 -122.2 --reference-harcon PUG1616:31 --confidence medium
```

## 4. Grille et rééchantillonnage [vérifié dans `scripts/build_ofs_atlas.py` et sur le gabarit]

- **Maille native dans la boîte** (171 018 triangles) : distance au
  centroïde voisin p5 / p25 / médiane / p75 / p95 / max = 58 / 71 / 86 /
  119 / 213 / 618 m ; arête du triangle équilatéral de même aire p5 / p25 /
  médiane / p75 / p95 / max = 113 / 134 / **163** / 226 / 400 / 1 135 m.
  Localement : Deception Pass 82 m entre centroïdes (élément à 10 m du
  point demandé), Tacoma Narrows 177 m, Admiralty Inlet 208 m, Bush Point
  281 m. Le pas de la grille régulière est pris à **200 m** (0,0018° ×
  0,0027°, soit 200 × 201 m à 47,85° N), entre la médiane de l'arête et
  son p75 : plus fin ne servirait que dans les passes, et le format n'a
  pas de pas variable. `metadata.json` porte `resolution_m 200` et
  `effective_resolution_m 163` (médiane de l'arête), avec les percentiles
  dans `grid.regrid.native.edge_m_percentiles`.
- L'analyse se fait **sur les éléments natifs** (centroïdes), exactement
  comme pour NorKyst : éléments jamais en eau écartés sur les 48 premières
  heures, `GridAnalysis` par tranches de 96 h avec les heures à sec en
  trous, critère de Rayleigh sur la durée totale. À 767 h, 13 constituants
  résolus : M2, S2, N2, K1, O1, M4, MS4, Q1, MN4, M6, 2N2, L2, 2MS6 ;
  171 003 éléments sur 171 003 ajustés.
- **Inférence** : l'atlas de référence `build/fes/atlas` (`FES_GLOBAL`) **ne
  répond pas au centre du domaine** (47,85° N, −122,7° E), ni à Deception
  Pass, ni à Bush Point, ni aux Narrows : à 1/16°, Puget Sound est de la
  terre ; il ne répond que dans le détroit de Juan de Fuca (Point Wilson
  servi depuis une cellule à 28 km). L'atlas `atlas/` est donc construit
  **sans inférence**, comme convenu, et K2, P1, NU2, MU2, MK4 manquent. La
  variante `atlas_harcon/` prend les constituants publiés par CO-OPS à la
  station **PUG1616 bin 31** (Admiralty Inlet au large de Bush Point, 8,8 m,
  l'entrée du Sound) via `--reference-harcon` : amplitude du grand axe
  projetée sur est et nord, ratios et retards K2/S2 0,262 et 24,6°, P1/K1
  0,273 et 1,9°, NU2/N2 0,116 et 40,8°, MU2/M2 0,037 et 262,5° ; MK4 n'est
  pas dans la liste NOAA et reste absent.
- Les constantes sont ensuite **rééchantillonnées au plus proche voisin**
  (`scipy.spatial.cKDTree`, plan équirectangulaire local) sur la grille
  régulière alignée sur des multiples du pas. Une cellule régulière est
  servie si son centre est à moins de **0,75 arête équivalente de
  l'élément le plus proche (au minimum 150 m)** : la portée suit la taille
  locale du maillage, ce qui garde le détroit maillé à 600 m couvert et le
  trait de côte des passes maillées à 100 m net ; sur un maillage
  régulier à 800 m, la règle fixe de NorKyst (700 m) est du même ordre. Le
  filtre `--min-speed-kt 0.2` s'applique après le rééchantillonnage.
- Résultat : grille 722 × 371 = 267 862 cellules, 101 753 à portée d'un
  élément ajusté (distance médiane 75 m ; 80 m et p90 213 m sur les
  cellules gardées), **92 322 au-dessus de 0,2 kt (90,7 %)**. Colonnes de
  diagnostic `regrid_dist_m` et `native_edge_m` (arête de l'élément
  source, médiane 314 m sur les cellules gardées : l'eau libre pèse plus
  que les passes).
- `metadata.json` : `rank 2`, `resolution_m 200`, `effective_resolution_m
  163`, `grid.origin "regrid"` avec `grid.regrid` (méthode, facteur de
  portée, statistiques d'arête, type `unstructured_triangles`),
  `source.short "sscofs"` (label runtime `sscofs_salish_200m`, lu par
  `MarcAtlasRegistry` [vérifié]), `label "NOAA SSCOFS (FVCOM), salish"`,
  `vertical "surface"` avec `vertical_detail "sigma layer 0 of FVCOM
  (centre at -0.0158 of the local depth)"`, `confidence "medium"` (option
  `--confidence`, `medium` par défaut), `validity_bbox null`,
  `analysis.mean_is_weather false` (767 h), `analysis.dry_cells_masked
  true`, `analysis.inference_reference` avec l'URL de la station CO-OPS
  dans la variante.

## 5. Résultats

Stations de courant CO-OPS de la boîte [vérifié sur
`mdapi/prod/webapi/stations.json?type=currentpredictions`] : 262
enregistrements, 81 stations harmoniques distinctes (type `H`, à trois bins
de profondeur en général), 14 subordonnées, 16 « faibles et variables ».
Constituants lus sur `stations/<id>/harcon.json?bin=<n>` (unités « meters,
centimeters/second », amplitude du grand axe, `majorPhaseGMT`, azimut `azi`
en degrés compas, 24 à 37 constituants selon la station), maxima de flot et
de jusant sur `datagetter?product=currents_predictions&interval=MAX_SLACK`
du 2026-03-01 au 2026-03-16 UTC (la fenêtre de `max_reconstructed_speed`),
en nœuds. Cellule servie par
`MarcAtlasRegistry.from_directory(...).cell_at(lat, lon)`, azimut de
l'atlas déduit de l'inclinaison de l'ellipse, phase comparée après levée
de l'ambiguïté 180° / 180°.

### 5a. Atlas sans inférence (`atlas/`, tel que spécifié) [vérifié, `build/ofs/sscofs/validation_noaa.json`]

| Station (bin) | Cellule servie | M2 atlas / NOAA (kt) | Azimut atlas / NOAA | Phase atlas / NOAA | S2 / K1 atlas (NOAA) | Max reconstruit / flot / jusant NOAA (kt) | Brut 32 j à l'élément | Variance expliquée u / v |
|---|---|---|---|---|---|---|---|---|
| PUG1701 Deception Pass Narrows (5,4 m) | 42 m | **3,47 / 5,21** (0,67) | 78° / 101,5° | 238° / 241° | 1,18 (0,96) / 0,65 (1,05) | 5,36 / 6,41 / 7,40 | 3,82 (6,02 à 94 m) | 0,97 / 0,71 |
| PUG1616 Admiralty Inlet, Bush Point (8,8 m) | 55 m | 1,79 / 1,97 (0,91) | 184° / 173° | 284° / 294° | 0,64 (0,53) / 0,60 (0,85) | 3,51 / 2,84 / 3,56 | 3,67 | 0,57 / 0,96 |
| PUG1623 Point Wilson 0,6 mi NE (5,1 m) | 102 m | 2,58 / 2,13 (1,21) | 137° / 133° | 281° / 279° | 1,06 (0,55) / 0,66 (0,68) | 4,44 / 2,88 / 3,39 | 4,44 | 0,83 / 0,95 |
| PUG1524 Tacoma Narrows nord, milieu (12,4 m) | 113 m | 1,94 / 2,53 (0,77) | 156° / 151° | 295° / 306° | 0,73 (0,60) / 0,56 (0,84) | 3,40 / 3,86 / 3,60 | 3,46 | 0,90 / 0,97 |
| PUG1527 Tacoma Narrows, 0,3 mi N du pont (7,0 m) | 70 m | 3,28 / 3,63 (0,90) | 202° / 208° | 299° / 303° | 1,20 (0,84) / 0,89 (1,17) | 5,46 / 5,53 / 4,99 | 4,95 | 0,92 / 0,99 |
| PUG1515 West Point, Seattle (4,8 m) | 102 m | 0,59 / 0,52 (1,13) | 168° / 211° | 279° / 264° | 0,17 (0,10) / 0,07 (0,17) | 0,81 / 1,17 / 0,52 | 1,15 | 0,45 / 0,88 |
| PUG1702 Rosario Strait (14,3 m) | 119 m | 1,39 / 1,63 (0,85) | 8° / 5° | 315° / 324° | 0,51 (0,44) / 0,78 (1,23) | 3,04 / 2,67 / 3,60 | 3,09 | 0,58 / 0,96 |
| PUG1501 Agate Passage sud (2,6 m) | 92 m | 2,04 / 2,31 (0,88) | 216° / 200° | 265° / 275° | 0,70 (0,48) / 0,40 (0,75) | 2,90 / 4,22 / 3,23 | 2,93 | 0,97 / 0,98 |

### 5b. Variante avec inférence CO-OPS (`atlas_harcon/`, référence PUG1616 bin 31) [vérifié, `validation_noaa_harcon.json`]

| Station | M2 atlas / NOAA (kt) | S2 atlas (NOAA) | N2 atlas (NOAA) | K1 atlas (NOAA) | O1 atlas (NOAA) | Max reconstruit / max NOAA (kt) |
|---|---|---|---|---|---|---|
| PUG1701 Deception Pass | 3,48 / 5,21 | **0,96 (0,96)** | 0,64 (0,98) | 0,82 (1,05) | 0,49 (0,31) | 5,21 / 7,40 (0,70) |
| PUG1616 Bush Point | 1,80 / 1,97 | **0,52 (0,53)** | 0,41 (0,44) | 0,75 (0,85) | 0,42 (0,42) | 3,44 / 3,56 (0,97) |
| PUG1623 Point Wilson | 2,59 / 2,13 | 0,86 (0,55) | 0,63 (0,33) | 0,82 (0,68) | 0,47 (0,31) | 4,33 / 3,39 (1,28) |
| PUG1524 Narrows nord | 1,94 / 2,53 | 0,59 (0,60) | 0,44 (0,48) | 0,70 (0,84) | 0,40 (0,36) | 3,31 / 3,86 (0,86) |
| PUG1527 Narrows pont | 3,29 / 3,63 | 0,97 (0,84) | 0,68 (0,69) | 1,12 (1,17) | 0,64 (0,60) | 5,36 / 5,53 (0,97) |
| PUG1515 West Point | 0,59 / 0,52 | 0,14 (0,10) | 0,12 (0,08) | 0,09 (0,17) | 0,07 (0,15) | 0,80 / 1,17 (0,68) |
| PUG1702 Rosario Strait | 1,40 / 1,63 | 0,42 (0,44) | 0,37 (0,36) | 0,98 (1,23) | 0,59 (0,63) | 3,02 / 3,60 (0,84) |
| PUG1501 Agate Passage | 2,04 / 2,31 | 0,56 (0,48) | 0,37 (0,45) | 0,50 (0,75) | 0,30 (0,41) | 2,85 / 4,22 (0,68) |

Lecture :

- **Le modèle voit la marée de Puget Sound.** Hors Deception Pass, M2
  sort entre 0,77 et 1,22 fois la valeur publiée, l'azimut du grand axe à
  3 à 16° près (43° à West Point, où le courant est faible ; effet de
  sillage de la pointe [supposé]), la phase à 2 à 16° près, et le maximum
  reconstruit vaut 0,84 à 0,97 fois le maximum publié à Bush Point, aux
  deux stations des Narrows et à Rosario. Le maximum NOAA inclut
  vraisemblablement le courant moyen le long du grand axe
  (`majorMeanSpeed` du même enregistrement, −0,62 kt à Deception Pass,
  −0,53 kt à Bush Point, dans le sens du jusant ; l'asymétrie flot 6,41 /
  jusant 7,40 à Deception Pass va dans ce sens) [supposé], que l'atlas
  laisse par construction dans `z0_*` (0,28 et 0,54 kt aux mêmes cellules,
  section 7) : à Bush Point, 3,51 kt de marée pure contre 3,56 kt de
  jusant maximal publié est un accord serré.
- **Deception Pass** : 3,47 kt de M2 contre 5,21 publiés (0,67) et 5,36 kt
  de maximum contre 7,40. La passe fait 150 à 200 m de large au pont
  [supposé] et le maillage y a 82 à 99 m d'arête [vérifié], soit deux
  éléments dans la largeur : les
  huit éléments à moins de 112 m de la station ont des maxima bruts sur
  32 jours de 3,5 à 6,0 kt [vérifié], et la cellule de 200 m servie prend
  celui qui tombe le plus près. Le modèle place son maximum **un kilomètre
  à l'ouest du pont** (9,78 kt bruts à 48,4059° N, −122,6572° E, 9,43 kt
  reconstruits dans la cellule 48,4065° N, −122,657° E, le maximum de tout
  l'atlas) : l'ordre de grandeur de la passe y est, la localisation à
  1 km près. Sous la moitié à 3 km, le garde-fou des passes non résolues
  (`build_tidal_world_map.py --write-gaps`, spike NorKyst section 7) ne
  se déclencherait pas ici (5,4 kt à la station contre 7,4 publiés, et
  9,4 kt à 1 km) ; il faut décider si « à 1 km près » mérite l'avertissement
  `currents.pass_unresolved` (section 8).
- **Agate Passage** (chenal de 300 m [supposé], station à 2,6 m) : M2 à
  0,88 mais
  maximum à 0,68, parce que M4 et le flot dominant (4,22 kt contre 3,23 de
  jusant) sont mal rendus (M4 0,04 contre 0,23 kt publiés) [vérifié].
- **Point Wilson** : 1,21 fois M2 et 1,28 fois le maximum publié ; c'est la
  seule station surestimée, à la sortie d'Admiralty Inlet dans le détroit,
  où le maillage passe à 334 m d'arête [vérifié] ; le tourbillon de la
  pointe est mal placé ou trop fort dans le modèle [supposé]. À 102 m de
  la cellule, ce n'est pas un effet de rééchantillonnage.
- **Signature de l'équinoxe sur 32 jours** [vérifié en 5a contre 5b] : sans
  inférence, S2 sort 1,2 à 1,9 fois trop fort et K1 0,6 à 0,75 fois trop
  faible à toutes les stations. Autour du 21 septembre, K2 est en phase
  avec S2 (battement semestriel, maximum aux équinoxes) et P1 en
  opposition avec K1 (battement annuel, minimum aux équinoxes) : un mois
  d'analyse attribue K2 à S2 et retranche P1 de K1. Avec les ratios de la
  station PUG1616, S2 tombe **exactement** sur la valeur publiée à
  Deception Pass, Bush Point, aux Narrows et à Rosario (0,96 / 0,96, 0,52 /
  0,53, 0,59 / 0,60, 0,97 / 0,84, 0,42 / 0,44) et K1 remonte de 0,62 à 0,78
  fois la valeur publiée, à 0,75 à 0,96. Le reste de l'écart sur K1 (10 à
  25 %) est dans le modèle ou dans la couche [supposé].
- Distribution du courant de marée maximal dans l'atlas (variante CO-OPS)
  [vérifié] : médiane 0,94 kt, p90 2,37 kt, p99 4,45 kt, maximum 9,16 kt ;
  43 388 cellules à 1 kt ou plus, 12 756 à 2 kt, 5 309 à 3 kt, 1 761 à
  4 kt, 227 à 5 kt, 12 à 6 kt. Le second pôle est Tacoma Narrows (6,4 kt
  en 47,2869° N, −122,5463° E, contre 5,53 kt publiés au pont).
- Comparaison contre FES2014 sur la boîte, 400 points
  (`scripts/compare_atlases.py`, `build/ofs/sscofs/compare_fes.json`)
  [vérifié] : M2 de référence médian 0,15 kt, rapport d'amplitude p10 /
  médiane / p90 = 0,59 / 3,85 / 10,05, écart d'inclinaison 35° / 71°, écart
  de phase +115° / 175°. Sans valeur : `FES_GLOBAL` (7 km) répond dans
  Puget Sound depuis des cellules jusqu'à 34 km (`_cell_threshold_m` =
  5 × 6 900 m) situées dans le détroit, et le sondage aléatoire tombe
  surtout dans le Sound. C'est un rappel que FES ne doit jamais servir
  dans un fjord ; la comparaison utile est celle des stations.

## 6. Coût d'un atlas complet, système par système

Débit mesuré sur SSCOFS [vérifié, `build/ofs/sscofs/download.log`] : un
fichier entier de 210 Mo en 9 s (23,5 Mo/s) ; par lectures partielles,
192 requêtes et 125 Mo par jour en 44 s, soit 2,8 Mo/s effectifs, bornés
par la latence (0,23 s par requête, pauses comprises). Le coût d'une boîte
ne dépend presque pas de sa taille (les tranches de surface sont lues en
entier quel que soit le nombre d'éléments gardés) mais du nombre d'heures :
**un an de SSCOFS coûte 4 h 30 de transfert et 45 Go sur le fil** pour
11 Go sur disque avec toute la boîte gardée, 30 Go avec tout le domaine
(33 Mo par jour et par 171 000 éléments, zlib 4) [supposé, extrapolé
linéairement de 32 jours] ; un système FVCOM plus petit (SFBOFS, 102 264
éléments) coûte le même temps de latence pour quatre fois moins d'octets
[supposé]. L'archive SSCOFS commence en septembre 2024 [vérifié sur les
préfixes] : l'année complète est disponible dès maintenant.

Inventaire du seau au 2026-09-20 [vérifié par listing S3 ; dimensions
lues sur le `.dds` THREDDS du fichier `n001` du 2026-09-20 ; mailles
mesurées par OPeNDAP, blocs 2 × 2 de `lon_rho` / `lat_rho` au centre et
aux quarts de grille pour ROMS, `lonc` / `latc` complets pour FVCOM] :

| Système | Domaine | Modèle, grille | Maille mesurée | Fichier horaire nowcast (Mo), cycles | Archive dans le seau | Marée et verdict |
|---|---|---|---|---|---|---|
| **SSCOFS** | Salish Sea, Puget Sound, Columbia | FVCOM, 433 410 triangles, 10 sigma | 58 à 618 m entre centroïdes dans la boîte (médiane 86 m), arête équivalente médiane 163 m | `fields` 210 ; 03 / 09 / 15 / 21 | 2024-09 à aujourd'hui | **fait ici** ; passes de 3 à 9 kt ; rang 2 |
| **SFBOFS** | baie de San Francisco, Golden Gate, delta | FVCOM, 102 264 triangles, 20 sigma | centroïdes 83 à 767 m, médiane 104 m | `fields` 57 ; 03 / 09 / 15 / 21 | 2024 à aujourd'hui | **le suivant** : Golden Gate 3 à 5 kt [supposé], même script (`--system sfbofs`), blocs à lire sur un gabarit |
| **NGOFS2** | nord du golfe du Mexique, Texas à Floride | FVCOM, 569 405 triangles | centroïdes 60 m à 5,6 km, médiane 168 m | `2ds` 122 (`u_surface`, `v_surface` sur `nele`), `fields` 646 toutes les 3 h ; 03 / 09 / 15 / 21 | 2023-08 à aujourd'hui | marée diurne faible, moins de 1 kt hors passes [supposé] ; intérêt limité |
| **CBOFS** | baie de Chesapeake | ROMS, 291 × 332 × 20 | 270 m à 1,5 km selon l'endroit (1,1 × 1,45 km au centre) | `fields` 62 ; 00 / 06 / 12 / 18 | 2022-01 à aujourd'hui (la plus longue) | 1 à 2 kt à l'embouchure et à Hampton Roads [supposé] ; c'était le repli du spike ; rang 1 |
| **DBOFS** | baie et fleuve Delaware | ROMS, 732 × 119 × 10 | 100 m à 1,6 km (102 × 398 m au centre) | `fields` 32 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | 1 à 2 kt dans le chenal [supposé] ; rang 1 à 2 |
| **TBOFS** | baie de Tampa | ROMS, 290 × 176 × 11 | 120 à 340 m | `fields` 20 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | courants faibles sauf Egmont Channel [supposé] ; intérêt faible |
| **GoMOFS** | golfe du Maine, baie de Fundy, Georges Bank | ROMS, 777 × 1 173 | 700 m uniforme (695 à 699 m aux trois points) | `2ds` 171 (`u_sur`, `v_sur`), `fields` 737 toutes les 3 h ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | **prioritaire après SFBOFS** : Fundy, Minas, Grand Manan, 3 à 8 kt [supposé], aucune autre source ouverte (WebTide bloqué) ; rang 1 à 700 m |
| **CIOFS** | Cook Inlet, Alaska | ROMS, 1 044 × 724 × 30 | 78 à 852 m | `fields` 588 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | marnage de 8 m, courants de 4 à 6 kt, mascaret de Turnagain [supposé] ; 588 Mo par heure, faisable seulement par lectures partielles |
| **WCOFS** | côte ouest, Californie à Colombie-Britannique | ROMS, 1 016 × 348 | 3,8 à 4,2 km | `2ds` 74, `fields` 354 toutes les 3 h ; un cycle 03 avec `n001` à `n024` | 2024 à aujourd'hui | bassin, marée faible au large ; rang 0 au mieux, FES2014 suffit |
| **NYOFS** | port de New York | ancien nommage (`fields.nowcast.nc` de 5,8 Mo par cycle, cycles 05 / 11 / 17 / 23) | non lue | par cycle | 2024 à aujourd'hui | Hell Gate 4 à 5 kt [supposé] ; format à part, à regarder après SFBOFS et GoMOFS |
| **SJROFS** | St. Johns River, Floride | ancien nommage (`fields.nowcast.nc` de 13 Mo par cycle) | non lue | par cycle | 2022-03 à aujourd'hui | fleuve, sans intérêt pour la voile |
| **LEOFS, LMHOFS, LOOFS, LSOFS** | Grands Lacs | FVCOM (11 509 à 174 015 triangles, 20 sigma) | non mesurée | `fields` 13 à 189 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | **sans marée**, hors sujet |
| **CREOFS** | fleuve Columbia (SELFE, `creofs.2dm` dans `OFS_Grid_Datum`) | | non lue | | `202310` à `202410` seulement, rien en 2026 | remplacé par SSCOFS [supposé] |
| **NECOFS** | Nouvelle-Angleterre | | | | préfixes `2025/`, `2026/02`, `2026/04`, `2026/09/14` vides | rien d'exploitable |
| **NGOFS, NEGOFS, NWGOFS** | anciens golfe du Mexique | | | | `201904` à `201912` | archives 2019, remplacés par NGOFS2 |
| **GLOFS, wcofs_da** | | | | | vides | |

Lecture : trois systèmes valent un atlas au rang 1 ou 2 après SSCOFS
(SFBOFS, GoMOFS, CIOFS), deux au rang 1 pour la côte est (CBOFS, DBOFS),
NYOFS pour Hell Gate si son format se lit ; le reste est sans marée
(lacs), au large (WCOFS) ou fluvial. Le script gère les systèmes FVCOM
(vitesses aux centroïdes, dimension `nele`, `siglay`) ; ROMS demande un
second chemin de lecture (grille C, `u[eta_u, xi_u]` et `v[eta_v, xi_v]` à
recentrer sur `rho` et à tourner par `angle`, couche de surface au dernier
indice de `s_rho`) que ni ce script ni `build_norkyst_atlas.py` (variables
déjà tournées) ne font ; `OFS_Grid_Datum/<sys>.romsgrid.nc` fournit
`angle` [vérifié que les fichiers existent, contenu non lu]. Les fichiers
`2ds` de GoMOFS et WCOFS (`u_sur`, `v_sur`) évitent au moins la question
de la couche.

## 7. Limites

1. **Les passes de deux éléments de large.** À Deception Pass, la cellule
   servie donne 0,67 fois M2 et le maximum du modèle est à 1 km ; à Agate
   Passage, 0,68 fois le maximum de flot. Ce n'est pas l'absence du
   chenal (Saltstraumen dans NorKyst) mais une passe résolue à deux
   mailles, avec un cisaillement latéral de 3,5 à 6 kt sur 100 m. À 200 m
   de pas régulier, le runtime servira la cellule la plus proche du point
   demandé et peut tomber d'un côté ou de l'autre. Le garde-fou mesuré des
   passes non résolues (rapport sous la moitié à 3 km) ne se déclenche pas
   ici ; il faut soit abaisser le seuil pour les passes de moins de 300 m
   [supposé], soit accepter `medium` posé par le builder, ce qui est fait.
2. **32 jours à l'équinoxe.** Sans inférence, S2 et K1 sont faux du tiers
   (section 5). Deux remèdes, tous deux sans compte : `--reference-harcon`
   (fait, une station CO-OPS par système, les ratios sont ceux d'une
   station et non du domaine [supposé qu'ils varient peu dans un même
   bassin]) et un an d'archive (disponible, 4 h 30 par système, section
   6), qui résout aussi NU2, MU2, MK4 et lève `mean_is_weather`. La
   variante CO-OPS est l'atlas à retenir pour un mois ; l'année reste la
   cible, comme pour NorKyst.
3. **Surface et non moyenne verticale** : couche sigma 0 (1,6 % de la
   profondeur), plus forte qu'un atlas `depth_averaged` (MARC) et que les
   bins CO-OPS à 5 à 14 m ; l'accord observé à 0,9 sur M2 aux stations
   profondes (Bush Point 8,8 m, Narrows 12,4 m, Rosario 14,3 m) suggère que
   l'écart de couche est du second ordre ici [supposé]. Les fichiers
   `fields` n'ont pas `ua` / `va` ; une moyenne verticale coûterait les
   9 blocs par variable (17 Mo par heure au lieu de 3,5).
4. **Courant moyen non tidal** : CO-OPS publie un courant moyen le long du
   grand axe de −0,62 kt à Deception Pass et −0,53 kt à Bush Point (vers le
   jusant, l'écoulement estuarien du Sound) ; l'atlas le laisse dans
   `z0_*` (0,28 et 0,54 kt sur 32 jours, médiane 0,21 kt sur l'atlas, p90
   0,57 kt, 3,63 kt au maximum dans les rivières) et la reconstruction
   servie est « marée seule » : le jusant réel dépasse le flot d'un nœud
   dans les passes. Le message utilisateur doit rester « marée seule », et
   c'est un argument pour servir `z0` un jour.
5. **Éléments à sec** : 9 096 éléments de la boîte passent à sec au moins
   une heure sur la première journée [vérifié] (deltas du Skagit et du
   Snohomish, Padilla Bay [supposé]) ;
   ils sont ajustés avec des trous et gardés s'ils passent 0,2 kt. Rien ne
   distingue dans l'atlas une cellule à sec la moitié du temps ; une
   colonne `n_samples` (minimum 79, médiane 768) le dit au lecteur
   attentif seulement.
6. **Longitudes en 0 à 360°** dans `lonc` / `latc` : converties par le
   script ; un `--bbox` en longitudes négatives est attendu.
7. **Un gabarit par système et par version du modèle** : les offsets sont
   ceux d'un fichier ; le contrôle par `time` et par taille protège contre
   un changement de version (tout fichier différent est téléchargé entier),
   mais un changement de maillage (nouvelle version SSCOFS) casserait la
   concaténation des jours, qu'il faudrait détecter par la taille du
   gabarit dans `layout.json`.
8. **Recouvrements** : le domaine SSCOFS monte à 52,1° N (détroit de
   Géorgie, Vancouver) et descend au Columbia ; la boîte livrée s'arrête à
   la frontière canadienne. Un atlas SSCOFS complet chevaucherait CIOPS
   Salish Sea (ECCC, 500 m, étape 5 du README) : à rang égal, 200 m gagne
   sur 500 m, ce qui est voulu, mais une `validity_bbox` devra couper le
   large de WCOFS et le fleuve Columbia (courant fluvial, pas de marée
   utile en amont de Longview [supposé]).

## 8. Faut-il l'intégrer et à quel rang ?

Oui, au **rang 2, 200 m, `confidence "medium"`**, et avant ECCC CIOPS pour
la Salish Sea :

- **rang 2** : c'est la convention du format (côtier, 100 à 500 m) et la
  ligne de la roadmap (« atlas par système, rang 2 ») ; l'atlas gagne sur
  FES2014 (rang 0) partout, sur un futur CIOPS 500 m (rang 2) par la
  résolution, et ne rencontre aucun atlas MARC, BSH ou NorKyst ;
- **`medium`** écrit par le builder tant que la validation se limite à
  huit stations d'un mois ; le moteur, lui, déduit `high` de 200 m et
  n'abaisse qu'à moins de 3 km d'une passe listée dans `tidal_gaps.geojson`
  (spike NorKyst, section 7). Deception Pass et Agate Passage devraient y
  être inscrits pour `sscofs_salish_200m` avec une règle adaptée (rapport
  sous 0,75 plutôt que sous la moitié, ou distance de 1 km) [supposé] ;
- **un an d'archive** par système (4 h 30 et 45 Go pour SSCOFS, moins pour
  SFBOFS) plutôt que le mois, et en attendant la variante
  `--reference-harcon` ; les stations CO-OPS servent ensuite de points de
  contrôle systématiques (81 stations harmoniques dans la seule boîte
  livrée, le script de validation du spike en lit 8 en 20 s) ;
- **domaine public** : l'atlas peut aller dans le dataset public sans
  autre formalité que l'attribution et la mention « modifié, non endossé
  par la NOAA », déjà dans `metadata.json`.

Ordre proposé pour l'étape 5 de la roadmap : SSCOFS entier (Salish Sea
jusqu'à Vancouver, un an, `validity_bbox` hors Columbia et hors large),
puis SFBOFS (même chemin FVCOM), puis GoMOFS par ses fichiers `2ds` (chemin
ROMS de surface à écrire, la baie de Fundy n'a pas d'autre source ouverte),
puis CIOFS. CIOPS d'ECCC reste utile pour la côte canadienne au nord de
la Salish Sea.

## 9. Fichiers produits (non trackés, sauf le script et ce document)

- `scripts/build_ofs_atlas.py` : téléchargement par `Range` et
  construction (ruff propre), options `--system`, `--template-key`,
  `--layer`, `--reach-factor`, `--min-reach-m`, `--reference-harcon`,
  `--confidence`.
- `build/ofs/sscofs/raw/sscofs.t03z.20260910.fields.n001.nc` : le gabarit,
  210 Mo.
- `build/ofs/sscofs/layout.json` : offsets de bloc, dtypes, taille du
  gabarit, 171 018 éléments.
- `build/ofs/sscofs/sscofs_salish_AAAAMMJJ.nc` : 32 fichiers, 993 Mo (du
  2026-08-19 au 2026-09-19), `u`, `v`, `wet` sur `[time, cell]` avec
  `lonc`, `latc`, `element`, `edge_m`, `depth_m`.
- `build/ofs/sscofs/atlas/SSCOFS_SALISH/` : l'atlas sans inférence, 9
  tuiles, `metadata.json`, `coverage.geojson`, 15,4 Mo ;
  `build/ofs/sscofs/atlas_harcon/SSCOFS_SALISH/` : la variante avec
  inférence CO-OPS, 19,7 Mo.
- `build/ofs/sscofs/download.log`, `build.log`, `build_harcon.log`,
  `compare_fes.json`, `validation_noaa.json`,
  `validation_noaa_harcon.json`, `box_elements.npy`.
