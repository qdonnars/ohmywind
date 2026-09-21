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
| **CBOFS** | baie de Chesapeake | ROMS, 291 × 332 × 20, blocs `[1, 10, 146, 166]` non compressés | 270 m à 1,5 km selon l'endroit (1,1 × 1,45 km au centre ; 926 m à l'embouchure, angle 20,7°) | `fields` 62 ; 00 / 06 / 12 / 18 | 2022-01 à aujourd'hui (la plus longue) | 1 à 2 kt à l'embouchure et à Hampton Roads [supposé] ; **chemin ROMS vérifié sur une heure** (section 10h, 0,13 Mo par heure par `Range` sur l'embouchure) ; rang 1 |
| **DBOFS** | baie et fleuve Delaware | ROMS, 732 × 119 × 10 | 100 m à 1,6 km (102 × 398 m au centre) | `fields` 32 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | 1 à 2 kt dans le chenal [supposé] ; rang 1 à 2 |
| **TBOFS** | baie de Tampa | ROMS, 290 × 176 × 11 | 120 à 340 m | `fields` 20 ; 00 / 06 / 12 / 18 | 2024 à aujourd'hui | courants faibles sauf Egmont Channel [supposé] ; intérêt faible |
| **GoMOFS** | golfe du Maine, baie de Fundy, Georges Bank | ROMS, 777 × 1 173 × 30, `2ds` en un bloc non compressé par champ | **700 m uniforme** (699,9 à 700,3 m par `pm` / `pn` dans la boîte de Fundy), rotation uniforme de 32,0° | `2ds` 171 (`u_sur`, `v_sur`, `wetdry_mask_rho`), `fields` 737 toutes les 3 h ; 00 / 06 / 12 / 18 | 2024-07 à aujourd'hui | **fait, section 10** : Minas Passage 8 à 9 kt et Cape d'Or 6 kt [vérifié dans le modèle, 8 kt publiés à Minas Passage [supposé]], mais Passamaquoddy, Head Harbour, Lubec et Petit Passage fermés à 700 m ; rang 1 à 700 m (déduit de la maille), `medium` |
| **CIOFS** | Cook Inlet, Alaska | ROMS, 1 044 × 724 × 30, blocs `[1, 10, 348, 241]` non compressés, `wetdry_mask_rho` | 37 à 616 m sur le domaine (médiane 175 × 205 m), 79 à 298 m autour d'Anchorage, angle de −75° à +47° | `fields` 588 ; 00 / 06 / 12 / 18 | 2024-06 à aujourd'hui | marnage de 8 m, courants de 4 à 6 kt, mascaret de Turnagain [supposé] ; **chemin ROMS vérifié sur une heure** (section 10h, 3,6 Mo par heure par `Range` sur Anchorage, 6,0 kt de surface vus, 12 841 cellules à sec) |
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
(vitesses aux centroïdes, dimension `nele`, `siglay`) et, depuis la
section 10, les systèmes ROMS (grille C, `u[eta_u, xi_u]` et
`v[eta_v, xi_v]` recentrés sur `rho` et tournés par `angle`, couche de
surface au dernier indice de `s_rho` dans les fichiers `fields`, ou `u_sur`
/ `v_sur` dans les fichiers `2ds` de GoMOFS) ; `angle`, `mask_rho`, `pm` et
`pn` sont dans chaque fichier horaire, `OFS_Grid_Datum/<sys>.romsgrid.nc`
n'est pas nécessaire [vérifié sur GoMOFS, CBOFS et CIOFS]. WCOFS (`2ds`, un
cycle 03 avec `n001` à `n024`) n'est pas câblé.

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
ROMS écrit et vérifié en section 10, la baie de Fundy n'a pas d'autre
source ouverte), puis CIOFS. CIOPS d'ECCC reste utile pour la côte canadienne au nord de
la Salish Sea.

## 9. Fichiers produits (non trackés, sauf le script et ce document)

- `scripts/build_ofs_atlas.py` : téléchargement par `Range` et
  construction (ruff propre), options `--system`, `--template-key`,
  `--layer`, `--reach-factor`, `--min-reach-m`, `--reference-harcon`,
  `--confidence` ; chemins FVCOM et ROMS (section 10), `--help` documente
  les deux.
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
- Section 10 (GoMOFS, chemin ROMS) :
  `build/ofs/gomofs/raw/gomofs.t00z.20260919.2ds.n001.nc`, le gabarit de
  171 Mo ; `build/ofs/gomofs/layout.json` (offsets, fenêtre de lignes,
  variables, époque ; réécrit par le dernier téléchargement, celui de la
  boîte du Maine) ; `build/ofs/gomofs/gomofs_fundy_AAAAMMJJ.nc`, 32
  fichiers de 5,8 Mo (184 Mo, du 2026-08-19 au 2026-09-19, `u`, `v`,
  `wet` sur `[time, cell]` avec `lonc`, `latc`, `element`, `eta`, `xi`,
  `angle_deg`, `edge_m`, `depth_m`) ; `gomofs_maine_AAAAMMJJ.nc`, 32
  fichiers de 2,4 Mo et `gomofs_stellwagen_AAAAMMJJ.nc`, 32 fichiers de
  0,8 Mo (boîtes de contrôle) ; `build/ofs/gomofs/atlas/GOMOFS_FUNDY/`
  (inférence FES, 24 tuiles, 7,9 Mo), `atlas_harcon/GOMOFS_FUNDY/`
  (inférence EPT0003), `atlas_maine/GOMOFS_MAINE/` (6 tuiles, 2,8 Mo),
  `atlas_stellwagen/GOMOFS_STELLWAGEN/` (4 tuiles, 1,0 Mo) ;
  `download.log`, `download_maine.log`, `download_stellwagen.log`,
  `build.log`, `build_harcon.log`, `build_maine.log`,
  `build_stellwagen.log`, `validation_noaa_fundy.json`,
  `validation_noaa_maine.json`, `validation_noaa_stellwagen.json`,
  `compare_fes_fundy.json`, `compare_fes_maine.json`, `passes_fundy.json` ;
  455 Mo au total, gabarit compris.

## 10. Chemin ROMS : GoMOFS et la baie de Fundy

Suite du 2026-09-21, même branche, même règle (rien de publié). Question :
le second chemin de lecture annoncé en section 6 (grille C de ROMS, `u` et
`v` décalés et tournés par `angle`) tient-il dans le même script, et
GoMOFS (golfe du Maine, ROMS à 700 m) donne-t-il un atlas utilisable sur la
baie de Fundy, où aucune autre source ouverte ne répond ? Bout à bout sur une
boîte de 1,3° × 4° (44,4° à 45,7° N, −67,3° à −63,3° E : Passamaquoddy,
Grand Manan, Minas Channel, Minas Passage et Minas Basin), 32 jours de
nowcast, puis deux boîtes de contrôle, la côte du Maine (43,55° à 44,8° N,
−70,3° à −68,6° E : Casco Bay, Portland, Penobscot Bay) et Stellwagen Bank
(42,25° à 42,6° N, −70,6° à −70,0° E, eau libre), parce que la boîte de
Fundy ne contient aucune station CO-OPS en eau dans le modèle.

Réponse courte : oui pour le chemin, oui avec réserve pour Fundy. Les
fichiers `2ds` de GoMOFS (171 Mo par heure, surface seule, un bloc HDF5 non
compressé par champ) se lisent par `Range` à **4,07 Mo par heure** (les
289 lignes de la boîte dans `u_sur`, `v_sur` et `wetdry_mask_rho`), soit
**768 heures en 15,4 minutes, 3,1 Go sur le fil, 184 Mo sur disque, analyse
en 3 s, atlas de 7,9 Mo** pour 29 854 cellules de 700 m. Le modèle donne
**8,1 kt à Minas Passage** (9,3 kt à moins de 5 km, contre 8 kt publiés
[supposé]), 6,1 kt à Cape d'Or, 2,7 kt dans le Grand Manan Channel. Mais à
700 m, GoMOFS **ferme la baie de Passamaquoddy** : Old Sow, Western Passage,
Head Harbour Passage, Cobscook et la Saint-Croix sont de la terre ou de
l'eau morte, les cinq stations CO-OPS de la boîte (Eastport, Robbinston,
Friar Roads, Kendall Head, Frost Ledge) sont à 3 à 13 km de la première
maille en eau, et l'atlas n'y répond pas. La validation harmonique se fait
donc sur la boîte du Maine : direction et phase justes dans les chenaux
de Casco Bay (azimut M2 à 0° et 1° près à Eagle Island et Cow Island) mais
amplitude 3 à 7 fois trop faible, parce que le modèle y ferme aussi les
baies intérieures ; et sur une troisième boîte en eau libre, les six
stations de Stellwagen Bank donnent **M2 à 0,88 à 1,21 fois la valeur
publiée** à cinq stations (1,83 sur la crête du banc), azimut et phase à
4° près à la station la mieux placée. Le même chemin lit sans
modification les fichiers `fields` de CBOFS et CIOFS (vérifié sur une
heure de chacun, à l'octet près contre une lecture locale).

### 10a. Dépôt et fichiers [vérifié par listing S3 le 2026-09-21]

- `gomofs/netcdf/2026/09/19/` contient **529 objets** : par cycle 00, 06,
  12 et 18 UTC, `2ds.n001` à `n006` (6 nowcast) et `2ds.f001` à `f072`
  (72 prévision), `fields.n003` et `n006` (nowcast toutes les 3 h
  seulement) et `fields.f003` à `f072`, `regulargrid` au même rythme que
  `fields`, `stations.nowcast.nc` (4,9 Mo) et `stations.forecast.nc`
  (56,8 Mo). Tailles : **`2ds` 171 414 927 octets**, `fields` 737 Mo,
  `regulargrid` 537 Mo. Les 32 jours du 2026-08-19 au 2026-09-19 ont chacun
  leurs 24 fichiers `2ds` nowcast, tous de la même taille (768 fichiers,
  aucune anomalie).
- Un fichier `2ds` [vérifié par h5py sur `gomofs.t00z.20260919.2ds.n001.nc`,
  171 Mo téléchargé en 7,8 s] : NetCDF-4, attribut `type` « ROMS/TOMS
  quicksave file », ROMS 4.2 (paquet NOS `nosofs.v3.6.15`, dépôt
  `NOAA-CO-OPS/2024-NOS-Code-Package_v3.6.0`), Conventions CF-1.4 et
  SGRID-0.3, `grd_file gomofs.romsgrid.nc`. Treize champs 2D dépendant du
  temps, chacun en **un seul bloc de 3,6 Mo, sans compression** :
  `zeta`, `u_sur` `[1, 777, 1172]`, `v_sur` `[1, 776, 1173]`, `temp_sur`,
  `salt_sur`, `Pair`, `Uwind`, `Vwind`, `Tair`, `wetdry_mask_rho` / `_u` /
  `_v` / `_psi` ; `ocean_time` en un bloc de 4 096 octets, unités
  « seconds since 2016-01-01 00:00:00 » (et non 2018 comme FVCOM ; le script
  lit maintenant l'époque dans l'attribut `units`). La grille est dans le
  fichier, en float64 contigu de 7,3 Mo chacun : `lon_rho`, `lat_rho`,
  `angle`, `mask_rho`, `h`, `pm`, `pn`, plus les variantes `u`, `v`, `psi`.
  `OFS_Grid_Datum/gomofs.romsgrid.nc` (219 Mo) existe mais n'est pas
  nécessaire. `u_sur` porte `_FillValue 1e37` sur les faces masquées et
  `location edge1`. 30 niveaux `s_rho`, `Vtransform 2`, `theta_s 5`,
  `hc 50` ; la couche de surface a `s_rho −0,0167` et `Cs_r −5,8e−5`, soit
  un centre à 0,5 m sous la surface par 75 m d'eau [vérifié par la formule
  de Vtransform 2].
- Convention des heures [vérifié] : `t00z n001` porte `ocean_time` =
  2026-09-18 19:00 UTC, donc `n001` à `n006` couvrent `HH−5` à `HH` comme
  pour SSCOFS ; un jour UTC de GoMOFS va de 19:00 la veille à 18:00.

### 10b. Grille [vérifié sur le gabarit]

- **777 × 1 173 points rho**, −73,04° à −61,25° E, 38,54° à 46,18° N,
  80,8 % d'eau ; **pas uniforme de 700 m** (`1/pm` et `1/pn` entre 699,9 et
  700,3 m dans la boîte, percentiles 5 à 95 tous à 700 m) ; **rotation
  uniforme de 32,00°** (`angle` entre 31,99° et 32,01° sur tout le domaine).
- La boîte de Fundy est le **coin nord-est de la grille** : lignes `eta`
  488 à 776 (la dernière), colonnes `xi` 705 à 1 172 (la dernière), 82 222
  points rho dont **30 739 en eau** (`mask_rho = 1`). Profondeur médiane
  71 m, maximum 224 m.
- Passamaquoddy [vérifié] : sur 1 352 points rho entre 44,85° et 45,1° N,
  −67,15° et −66,85° E, **300 seulement sont en eau**. Le point rho le plus
  proche d'Estes Head (Eastport) est à terre, la première maille en eau à
  6,0 km ; Robbinston 13,0 km ; Friar Roads 4,4 km ; Kendall Head 3,2 km ;
  Frost Ledge 4,6 km ; Old Sow 3,1 km ; Lubec Narrows 5,0 km. Petit Passage
  (Digby Neck) est fermé aussi (première eau à 1,7 km). Head Harbour Passage
  et Letete Passage ont une maille en eau à 150 à 175 m, mais isolée de la
  baie fermée, donc sans courant (0,4 kt, section 10e).
- Ce que le script fait [vérifié dans `read_template_roms`,
  `fetch_hour_roms`, `_to_rho`, `_rotate`] :
  1. gabarit : `lon_rho`, `lat_rho`, `angle`, `mask_rho`, `h`, `pm`, `pn`
     lus par h5py ; cellules = points rho en eau dans la boîte ; fenêtre de
     lignes `[eta0, eta1]` ; offsets de bloc de `ocean_time`, `u_sur`,
     `v_sur`, `wetdry_mask_rho` par `get_chunk_info`. Pour un fichier
     `fields` (CBOFS, CIOFS), la variable est `u[1, s_rho, eta, xi]` en blocs
     `[1, k, ce, cx]` et la couche lue est la dernière (`s_rho − 1`, la
     surface) ; `--layer n` compte depuis la surface, comme pour FVCOM ;
  2. par heure : `ocean_time` sur 8 octets (contrôle de la taille par
     `Content-Range` et de l'heure à la seconde, sinon fichier entier par
     netCDF4, chemin jamais emprunté ici) ; puis, dans chaque bloc qui
     rencontre la fenêtre de lignes, les lignes de la couche de surface,
     contiguës sur toute la largeur du bloc (`cx`, y compris le rembourrage
     des blocs de bord), coupées aux colonnes valides après lecture ;
     `u_sur` lignes 488 à 776 (1 354 832 octets), `v_sur` lignes 487 à 775
     (`v` est sur les faces entre lignes, il faut la ligne du dessous),
     `wetdry_mask_rho` lignes 488 à 776 ; **4,07 Mo et 4 requêtes par
     heure** ;
  3. `1e37` → NaN ; `u` moyenné sur les deux faces `xi` de chaque cellule
     rho et `v` sur ses deux faces `eta`, **en ignorant la face masquée**
     (une cellule côtière prend la valeur de sa face ouverte plutôt que la
     moitié ; les outils ROMS usuels moyennent avec zéro sur le mur, ce qui
     sous-estime la cellule de bord de moitié [supposé que la valeur de la
     face ouverte est le meilleur estimateur pour un atlas de passe]) ; les
     bords de grille gardent leur face unique ;
  4. rotation : `est = u cos a − v sin a`, `nord = u sin a + v cos a` avec
     l'`angle` de chaque cellule (32° ici, mais −75° à +47° sur CIOFS, où
     l'angle par cellule compte) ;
  5. `mask_rho = 0` : jamais dans l'index ; `wetdry_mask_rho = 0` : NaN pour
     l'heure ; en 32 jours **aucune cellule de la boîte n'a été à sec**
     (`n_samples` minimum 768), les bancs de Minas Basin sont masqués en
     dur dans `mask_rho` [supposé] ;
  6. fichiers journaliers au format exact du chemin FVCOM (`u`, `v`, `wet`
     sur `[time, cell]`, `lonc`, `latc`, `element` = indice plat
     `eta × 1173 + xi`, `edge_m` = √(dx·dy) = 700 m, `depth_m`) plus
     `eta`, `xi`, `angle_deg` et les attributs `native_grid`, `staggering`,
     `vertical_detail`, `wet_dry_source` ; le build ne change pas, il lit
     ces attributs pour `metadata.json`.
- Contrôle [vérifié] : sur le gabarit lui-même, la lecture par `Range`
  depuis le seau et la lecture locale netCDF4 du fichier entier donnent des
  vitesses est et nord **identiques à l'octet près** (écart maximal 0,0)
  sur les 30 739 cellules, même masque de NaN ; idem sur CBOFS (1 506
  cellules de l'embouchure de la Chesapeake, blocs 2 × 2 avec rembourrage,
  couche 19) et CIOFS (78 860 cellules de Cook Inlet, 9 blocs de surface
  sur 27, masque à sec de 12 841 cellules retrouvé à l'identique).
- Le chemin FVCOM est inchangé : SSCOFS reconstruit dans un répertoire de
  travail donne 92 322 cellules, 9 tuiles et un `metadata.json` identique
  (hors horodatage) à celui de la section 3 [vérifié].

### 10c. Volumes et temps [vérifié, `build/ofs/gomofs/download.log`, `build.log`]

- gabarit `gomofs.t00z.20260919.2ds.n001.nc` : **171 Mo en 7,8 s** ;
- 32 jours du 2026-08-19 au 2026-09-19 (768 heures, du 2026-08-18 19:00 au
  2026-09-19 18:00 UTC), **98 Mo fetchés par jour, 3 136 Mo au total, 927 s
  de transfert (15,4 min), 29 s par jour** avec 0,2 s de pause entre les
  heures, 96 requêtes par jour ; **0 fichier entier, 0 relance, 0 heure
  manquante** ; 32 fichiers de 5,8 Mo, **184 Mo sur disque** (zlib 4) ;
- analyse harmonique : **2,8 s** (30 739 cellules × 768 h × 2 composantes,
  13 constituants résolus, 4 inférés) ;
- atlas `GOMOFS_FUNDY` : **29 854 cellules à 0,2 kt ou plus, 24 tuiles de
  0,5°, 7,87 Mo** (264 octets par cellule).

Commandes (depuis la racine du dépôt) :

```
env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --download --no-build --system gomofs --start 2026-08-19 --days 32 \
  --bbox 44.4 -67.3 45.7 -63.3 --source-dir build/ofs/gomofs --zone fundy \
  --template-key gomofs/netcdf/2026/09/19/gomofs.t00z.20260919.2ds.n001.nc

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --system gomofs --source-dir build/ofs/gomofs --zone fundy \
  --atlas-id GOMOFS_FUNDY --output-dir build/ofs/gomofs/atlas/GOMOFS_FUNDY \
  --bbox 44.4 -67.3 45.7 -63.3 --resolution-m 700 --dlat-deg 0.0063 --dlon-deg 0.0089 \
  --reference-atlas-dir build/fes/atlas --confidence medium --min-speed-kt 0.2

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --system gomofs --source-dir build/ofs/gomofs --zone fundy \
  --atlas-id GOMOFS_FUNDY --output-dir build/ofs/gomofs/atlas_harcon/GOMOFS_FUNDY \
  --bbox 44.4 -67.3 45.7 -63.3 --resolution-m 700 --dlat-deg 0.0063 --dlon-deg 0.0089 \
  --reference-harcon EPT0003:4 --confidence medium --min-speed-kt 0.2

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --download --no-build --system gomofs --start 2026-08-19 --days 32 \
  --bbox 43.55 -70.3 44.8 -68.6 --source-dir build/ofs/gomofs --zone maine \
  --template-key gomofs/netcdf/2026/09/19/gomofs.t00z.20260919.2ds.n001.nc

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with h5py --with httpx \
  --with numpy --with polars --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_ofs_atlas.py --system gomofs --source-dir build/ofs/gomofs --zone maine \
  --atlas-id GOMOFS_MAINE --output-dir build/ofs/gomofs/atlas_maine/GOMOFS_MAINE \
  --bbox 43.55 -70.3 44.8 -68.6 --resolution-m 700 --dlat-deg 0.0063 --dlon-deg 0.0089 \
  --reference-atlas-dir build/fes/atlas --confidence medium --min-speed-kt 0.2
```

### 10d. Rééchantillonnage, inférence, métadonnées [vérifié, `metadata.json`]

- **Pas de sortie 700 m**, le pas natif : `--dlat-deg 0.0063` (701 m) et
  `--dlon-deg 0.0089` (700 m à 45,05° N). Plus fin ne créerait que des
  copies (le plus proche voisin d'une grille tournée de 32° ne contient
  rien entre deux points rho), plus grossier perdrait des cellules
  côtières. Une grille régulière de 207 × 450 = 93 150 cellules, **30 666 à
  portée** d'un point rho (portée `0,75 × 700 = 525 m`, au-delà de la
  demi-diagonale de 495 m : l'intérieur est couvert sans trou, le trait de
  côte tombe à la maille près) pour 30 739 points rho en eau, distance
  médiane 279 m, p90 393 m ; **29 854 au-dessus de 0,2 kt (97,4 %)**.
  `resolution_m 700` et `effective_resolution_m 700` (médiane de `edge_m`).
- **Inférence** : `FES_GLOBAL` répond au centre du domaine (cellule
  44,9375° N, −65,6875° E, M2 1,70 kt) et donne K2/S2 0,289 et 5,1°, P1/K1
  0,305 et 4,7°, NU2/N2 0,256 et 1,3°, MU2/M2 0,004 et 77,8°. La variante
  `atlas_harcon/` (station **EPT0003 Estes Head bin 4, 23,7 m**, la seule
  station harmonique du régime de Fundy même si le modèle n'y a pas d'eau)
  donne 0,290 et 357,8°, 0,323 et 0,7°, 0,249 et 1,3°, 0,015 et 71,6° :
  les deux références concordent à 1 % près sur K2 et NU2, à 6 % sur P1,
  et les deux atlas ne diffèrent que de 2 cellules et de 0,6 % sur le
  maximum (9,31 contre 9,37 kt). L'atlas retenu est celui de FES, tel que
  spécifié ; MK4 reste absent.
- `metadata.json` : `rank 1` (déduit de la maille, section 10g), `resolution_m 700`, `confidence "medium"`,
  `source.short "gomofs"` (label runtime `gomofs_fundy_700m`), `label "NOAA
  GOMOFS (ROMS), fundy"`, `source.product
  "gomofs.tHHz.YYYYMMDD.2ds.nNNN.nc"`, `grid.regrid.native.type
  "structured_curvilinear_c_grid"` avec `staggering` et `wet_dry_source
  "wetdry_mask_rho"`, `vertical "surface"` et `vertical_detail "surface
  layer of ROMS (u_sur; s_rho -0.0167, Cs_r -5.76e-05)"`, licence et
  attribution identiques à SSCOFS (domaine public, textes lus le
  2026-09-21, mention « modifié, non endossé ») avec la précision « C-grid
  velocities averaged onto rho points and rotated to east / north » dans
  la liste des modifications, `analysis.mean_is_weather false` (767 h),
  `dry_cells_masked true`, `coverage.geojson` sur la boîte,
  colonne `max_speed_kn`.
- Distribution du courant de marée maximal [vérifié] : médiane 2,13 kt,
  p90 2,92 kt, p99 4,76 kt, **maximum 9,31 kt** à 45,3506° N, −64,4850° E
  (Minas Passage, côté Cape Split) ; 26 506 cellules à 1 kt ou plus,
  17 272 à 2 kt, 2 544 à 3 kt, 619 à 4 kt, 240 à 5 kt, 91 à 6 kt, 59 à
  7 kt. Courant moyen `z0` : médiane 0,18 kt, p90 0,49 kt, maximum 1,71 kt.
  La baie de Fundy entière dépasse 2 kt sur 58 % de ses cellules : c'est
  la marée la plus forte de toute la cascade.

### 10e. Validation

Stations CO-OPS [vérifié sur
`mdapi/prod/webapi/stations.json?type=currentpredictions`, `harcon.json`
par station et bin publié (`currbin`), `datagetter?product=currents_predictions&interval=MAX_SLACK`
du 2026-03-01 au 2026-03-16 UTC, `build/ofs/gomofs/validation_noaa_fundy.json`
et `validation_noaa_maine.json`] :

**Boîte de Fundy** : deux stations harmoniques (EPT0003 Estes Head,
Eastport, M2 2,01 kt à 23,7 m ; EPT0004 Robbinston, Saint-Croix, M2
0,79 kt) et trois subordonnées (ACT0091 Friar Roads, 3,5 kt de jusant
publié ; ACT0101 Western Passage off Kendall Head, 3,8 kt ; ACT0106 off
Frost Ledge, 2,4 kt). **Aucune n'est servie** (`cell_at` répond `None`) :
le point rho le plus proche est à terre pour les cinq, la première maille
en eau est à 3,2 à 13,0 km et, sous 5 km (le seuil du registre,
`max(5 km, 5 × 700 m)`), les mailles en eau de l'entrée de Passamaquoddy
sont sous 0,2 kt et écartées par le filtre (maximum brut sur 32 jours de
0,22 à 0,85 kt aux mailles les plus proches). Une passe à 9,3 kt dans la
littérature est absente de l'atlas [vérifié] : c'est le cas
`currents.pass_unresolved` par excellence, à inscrire dans
`tidal_gaps.geojson` pour `gomofs_fundy_700m` (Old Sow / Western Passage,
Head Harbour Passage, Lubec Narrows, Petit Passage).

**Boîte du Maine** (atlas `atlas_maine/GOMOFS_MAINE`, même méthode, FES au
centre) [vérifié, `validation_noaa_maine.json`] :

| Station (bin, profondeur) | Première maille en eau ; cellule servie (distance) | M2 atlas / NOAA (kt) | Azimut atlas / NOAA | Phase atlas / NOAA | Max reconstruit / flot / jusant NOAA (kt) | Brut 32 j à la maille la plus proche (kt) |
|---|---|---|---|---|---|---|
| PEB0610 Fort Point Ledge, Penobscot Bay (21,6 m) | 293 m ; **aucune** (maille sous 0,2 kt, écartée) | / 0,89 | / 72° | / 359° | / 1,51 / 0,90 | 0,19 |
| PEB0611 Hosmer Ledge, Castine (16,0 m) | 1 712 m ; 2 354 m | 0,16 / 1,12 (0,14) | 341° / 59° (78°) | 10° / 20° (−11°) | 0,21 / 1,38 / 1,28 | 0,28 |
| CAB1401 Portland Harbor Entrance (11,6 m) | 112 m ; **aucune** (écartée) | / 0,63 | / 315° | / 18° | / 0,72 / 1,17 | 0,45 |
| CAB1416 Eagle Island, Broad Sound (27,8 m) | 351 m ; 344 m | 0,19 / 0,86 (0,22) | **349° / 349° (0°)** | **11° / 9° (+2°)** | 0,30 / 1,47 / 0,73 | 0,64 |
| CAB1402 Spring Point (11,1 m) | 2 344 m ; aucune | / 0,72 | / 322° | / 14° | / 1,07 / 0,77 | 0,46 |
| CAB1404 Diamond Island Roads (10,2 m) | 2 391 m ; aucune | / 0,33 | / 356° | / 15° | / 0,41 / 0,70 | 0,46 |
| CAB1410 Hussey Sound, Long et Peaks (21,3 m) | 281 m ; 3 545 m | 0,08 / 0,81 (0,10) | 28° / 315° (−74°) | 315° / 18° (−63°) | 0,20 / 1,10 / 0,76 | 0,46 |
| CAB1412 Hussey Sound, Cow Island (17,3 m) | 2 125 m ; 4 098 m | 0,12 / 0,79 (0,15) | **17° / 16° (−1°)** | 339° / 19° (−40°) | 0,21 / 0,85 / 1,27 | 0,44 |
| CAB1413 Cow Island NE (12,0 m) | 2 652 m ; 4 369 m (même cellule) | 0,12 / 0,51 (0,24) | 17° / 342° (−35°) | 339° / 4° (−25°) | 0,21 / 0,67 / 1,19 | 0,44 |
| CAB1414 Lucksee Sound (12,2 m) | 169 m ; 297 m | 0,14 / 0,48 (0,29) | 15° / 50° (34°) | 341° / 47° (−66°) | 0,24 / 0,53 / 0,61 | 0,71 |
| CAB1415 Stepping Stones (12,9 m) | 245 m ; 1 030 m | 0,12 / 0,38 (0,32) | 17° / 351° (−26°) | 339° / 3° (−24°) | 0,21 / 0,47 / 0,53 | 0,68 |
| CAB1409 Chandler Cove (11,2 m) | 101 m ; 1 349 m (même cellule que Lucksee) | 0,14 / 0,54 (0,26) | 15° / 7° (−8°) | 341° / 3° (−22°) | 0,24 / 0,65 / 0,89 | 0,44 |

Lecture : **la direction et la phase sont bonnes, l'amplitude est
fausse d'un facteur 3 à 7 dans les chenaux.** Là où l'atlas a une cellule à
moins de 400 m (Eagle Island, Lucksee Sound), l'azimut du grand axe M2
tombe à 0° et 34° près et la phase à 2° près à Eagle Island : le décalage
et la rotation de 32° sont justes (une rotation manquante donnerait 32°
d'écart systématique). Mais M2 vaut 0,10 à 0,32 fois la valeur publiée et
le maximum reconstruit 0,2 à 0,3 kt contre 0,5 à 1,5 kt publiés. Toutes
ces stations sont dans des chenaux de 0,5 à 2 km entre les îles de Casco
Bay ou à l'embouchure de la Penobscot : à 700 m le modèle ferme les baies
intérieures (Portland Harbor, Back Cove, Penobscot River), il n'y a plus de
prisme de marée à remplir et le courant de chenal disparaît ; le maximum
brut sur 32 jours (0,44 à 0,71 kt) y dépasse d'ailleurs le maximum de marée
reconstruit (0,2 à 0,3 kt), signe que la surface y est surtout portée par
le vent [supposé]. Les stations sans cellule (Fort Point Ledge, Portland
Harbor Entrance, Spring Point, Diamond Island Roads) ont leur maille à
moins de 2,4 km mais sous 0,2 kt de marée, écartée par le filtre. En eau
libre, l'atlas du Maine vaut 1,16 fois FES2014 sur M2 (400 points,
`compare_fes_maine.json`, médiane, p10 0,71, p90 2,12 ; référence 0,17 kt)
et l'atlas de Fundy 1,24 fois (p10 0,36, p90 1,51, référence 1,46 kt,
inclinaison à 12° près, phase à +5°) [vérifié] : la marée du modèle est
juste au large et en surface, plus forte que la moyenne verticale de FES
comme attendu. Ce que cette boîte valide, c'est le chemin de lecture ;
ce qu'elle mesure, c'est la limite du modèle dans les chenaux, la même
qu'à Passamaquoddy.

**Boîte de Stellwagen Bank** (42,25° à 42,6° N, −70,6° à −70,0° E, eau
libre de 30 à 140 m au large de Boston ; 82 lignes, 1,16 Mo par heure, 896 Mo
en 838 s ; atlas `atlas_stellwagen/GOMOFS_STELLWAGEN`, 3 802 cellules, 4
tuiles, 1,0 Mo, FES au centre) [vérifié, `validation_noaa_stellwagen.json`] :

| Station (bin, profondeur) | Cellule servie | M2 atlas / NOAA (kt) | Azimut atlas / NOAA | Phase atlas / NOAA | S2 / N2 / K1 atlas (NOAA) | Max reconstruit / flot / jusant NOAA (kt) | Brut 32 j |
|---|---|---|---|---|---|---|---|
| BOS1135, 17 nmi ESE d'Eastern Point (93,8 m) | 267 m | 0,35 / 0,29 (1,21) | 261° / 297° (36°) | 45° / 354° (+51°) | 0,03 (0,04) / 0,06 (0,06) / **0,16 (0,01)** | 0,56 / 0,31 / 0,39 | 1,14 |
| BOS1133, 13,4 nmi SE (21,6 m) | 215 m | 0,38 / 0,43 (0,88) | 260° / 227° (−33°) | 3° / 40° (−37°) | 0,06 (0,08) / 0,14 (n. p.) / **0,22 (0,07)** | 0,77 / 0,47 / 0,61 | 1,24 |
| BOS1134, Stellwagen Basin (74,6 m) | 159 m | 0,27 / 0,23 (1,17) | 254° / 284° (30°) | 17° / 356° (+21°) | 0,03 (0,01) / 0,08 (n. p.) / **0,20 (0,03)** | 0,64 / 0,29 / 0,27 | 1,17 |
| BOS1134 bin 17 (10,6 m) | 159 m | 0,27 / 0,23 (1,17) | 74° / 32° (−41°) | 197° / 237° (−41°) | 0,03 (0,04) / 0,08 (n. p.) / 0,20 (0,04) | 0,64 / 0,29 / 0,36 | 1,17 |
| BOS1130, Stellwagen Basin est (73,0 m) | 344 m | 0,27 / 0,23 (1,17) | 344° / 267° (−77°) | 292° / 4° (−72°) | 0,03 (0,02) / 0,05 (0,04) / **0,18 (0,02)** | 0,45 / 0,24 / 0,38 | 1,04 |
| BOS1130 bin 17 (9,0 m) | 344 m | 0,27 / 0,25 (1,08) | 344° / 12° (28°) | 292° / 282° (+10°) | 0,03 (0,03) / 0,05 (0,08) / 0,18 (0,03) | 0,45 / 0,47 / 0,49 | 1,04 |
| BOS1131, 16 nmi N de Race Point (27,5 m) | 362 m | 0,84 / 0,46 (1,83) | **272° / 268° (−4°)** | **9° / 5° (+4°)** | 0,12 (0,06) / 0,26 (0,07) / **0,24 (0,02)** | 1,20 / 0,46 / 0,65 | 1,80 |
| BOS1132, 15 nmi NNE de Race Point (64,1 m) | 276 m | 0,55 / 0,56 (0,98) | 280° / 294° (13°) | 27° / 7° (+20°) | 0,06 (0,08) / 0,14 (0,12) / **0,17 (0,05)** | 0,82 / 0,49 / 0,90 | 1,83 |
| BOS1132 bin 15 (8,1 m) | 276 m | **0,55 / 0,43 (1,28)** | **280° / 285° (4°)** | **27° / 30° (−3°)** | 0,06 (0,03) / 0,14 (0,05) / 0,17 (0,07) | 0,82 / 0,43 / 0,76 | 1,83 |

Lecture : **en eau libre, le chemin ROMS restitue M2 en amplitude,
direction et phase.** Les bins publiés sont les plus profonds (bin 1, à 22
à 94 m) ; comparé au bin le moins profond disponible, l'accord est serré à
BOS1132 (8 m : 1,28 en amplitude, 4° d'azimut, 3° de phase) et à BOS1130
(9 m : 1,08, 28°, 10°). À BOS1131 le rapport de 1,83 est celui de la
surface contre un bin à 27 m sur un fond de 32 m, dans la couche de fond
[supposé]. Là où M2 fait 0,23 kt (BOS1130, BOS1134 profonds), l'azimut et
la phase s'écartent de 30° à 77° : l'ellipse est presque ronde
(`m2_minor` 0,02 à 0,04 kt publiés) et l'axe mal défini, comme à West
Point en section 5. **K1 est 3 à 10 fois trop fort** partout (0,16 à 0,24 kt
contre 0,01 à 0,07) : sur 32 jours d'été, la brise de mer diurne de la
couche de surface (S1, 24,00 h) n'est pas séparable de K1 (23,93 h,
Rayleigh 8 766 h, un an) et l'analyse la lui attribue [supposé pour la cause,
vérifié pour les chiffres] ; le maximum reconstruit en est gonflé (0,45 à
1,20 kt contre 0,24 à 0,90 publiés) et le maximum brut de surface (1,0 à
1,8 kt) est surtout du vent. À Fundy, K1 vaut 0,13 kt pour 6,5 kt de M2 à
Minas Passage et l'effet est négligeable ; sur un plateau à 0,3 kt de M2
il compte, et c'est un argument de plus pour l'année d'archive (S1 et K1
ne se séparent qu'à 365 jours par le critère de Rayleigh à 1,0, P1 et K1
comme K2 et S2 à 183 jours) ou pour un `--min-speed-kt` plus haut au
large.

### 10f. Les passes de Fundy [vérifié pour l'atlas, [supposé] pour les valeurs publiées du gazetteer]

| Point | Cellule servie (distance) | M2 atlas (kt), azimut, phase | S2 / N2 / K1 (kt) | Max reconstruit (kt), max à 3 km, à 5 km | Publié (gazetteer) |
|---|---|---|---|---|---|
| Minas Passage (45,35° N, −64,40° E) | 45,3506 / −64,3960 (323 m) | **6,50**, 91°, 216° | 1,01 / 1,30 / 0,13 | **8,08**, 9,07, 9,31 | 8 à mi-marée (RASC 2012, confiance moyenne) [supposé] |
| Cape Split, Minas Channel (45,33, −64,50) | 45,3317 / −64,5028 (283 m) | 3,45, 30°, 22° | 0,51 / 0,66 / 0,07 | 4,83, 9,31, 9,31 | 5, « 5 à 8 au jusant » (incertain) [supposé] |
| Old Sow / Western Passage (44,92, −66,99) | aucune (première cellule à 7,0 km) | | | | 9,3 (incertain) [supposé] |
| Grand Manan Channel (44,75, −66,95) | 44,7521 / −66,9503 (229 m) | 2,35, 29°, 17° | 0,34 / 0,46 / 0,08 | 2,68, 2,87, 3,07 | pas dans le gazetteer |
| Head Harbour Passage (44,95, −66,92) | 44,9537 / −66,9147 (585 m) | 0,32, 119°, 351° | 0,05 / 0,06 / 0,05 | 0,37, 0,55, 0,97 | pas dans le gazetteer ; 3 à 5 kt dans les instructions nautiques [supposé] |
| Cape d'Or, Minas Channel (45,28, −64,75) | 45,2813 / −64,7520 (207 m) | 4,77, 75°, 26° | 0,72 / 0,94 / 0,09 | 6,09, 6,21, 6,21 | pas dans le gazetteer |
| Minas Basin (45,30, −64,10) | 45,3002 / −64,1023 (177 m) | 2,23, 89°, 45° | 0,34 / 0,42 / 0,04 | 2,62, 3,00, 3,12 | pas dans le gazetteer |
| Approches de Saint John (45,20, −66,05) | 45,1994 / −66,0514 (128 m) | 1,16, 74°, 5° | 0,18 / 0,25 / 0,07 | 1,52, 1,83, 2,03 | pas dans le gazetteer |
| Chignecto Bay (45,55, −64,85) | 45,5522 / −64,8499 (240 m) | 1,69, 55°, 28° | 0,31 / 0,30 / 0,06 | 1,99, 2,24, 2,39 | pas dans le gazetteer |
| Petit Passage, Digby Neck (44,39, −66,21) | aucune (première cellule à 1,7 km, 1,9 kt) | | | | pas dans le gazetteer |

Lecture : Minas Passage, 5 km de large et 7 mailles, est résolue et le
maximum reconstruit (8,1 kt à la cellule, 9,3 kt une maille plus à l'ouest)
tombe sur la valeur publiée [supposé, valeur de littérature] ; le rapport
S2/M2 de 0,155 et N2/M2 de 0,20 sont ceux d'une marée de Fundy dominée par
M2 avec un fort N2 [supposé]. Cape Split est à la limite : la cellule
servie donne 4,8 kt mais le maximum de l'atlas (9,3 kt) est à moins de
3 km, dans la veine de Minas Passage. Les passes de moins de 1 km
(Passamaquoddy, Petit Passage) n'existent pas dans le modèle.

### 10g. Limites

1. **700 m ferme les passes de moins de 1 km.** Ce n'est pas le cas de
   SSCOFS (deux mailles dans Deception Pass) : ici la passe manque, comme
   Saltstraumen dans NorKyst. Le garde-fou `currents.pass_unresolved`
   (spike NorKyst, section 7) doit couvrir Old Sow / Western Passage, Head
   Harbour Passage, Lubec Narrows et Petit Passage pour `gomofs_fundy_700m`
   [supposé pour la liste, vérifié pour l'absence].
2. **Rang 1 à 700 m** : par la convention du format
   (`docs/harmonic_atlas_format.md`), 700 m relève du rang 1 (plateau, 500 m
   à 2 km) et non du rang 2 (côtier, 100 à 500 m). Le premier build posait
   le rang 2 ; le script déduit désormais le rang de `--resolution-m` quand
   `--rank` n'est pas donné (3 sous 100 m, 2 jusqu'à 500 m, 1 jusqu'à 2 km,
   0 au-delà) et l'atlas de Fundy a été reconstruit au rang 1 [vérifié dans
   `metadata.json`]. Sans concurrent dans la zone (FES2014 au rang 0 est la
   seule autre source, pas de MARC, BSH, NorKyst ni CMEMS ici), cela n'a pas
   d'effet aujourd'hui ; un atlas ECCC (CIOPS East, 2 km) arriverait au
   rang 1 lui aussi et perdrait par la résolution [supposé] ;
   `confidence medium`.
3. **Aucune station en eau dans la boîte** : la validation harmonique est
   faite 150 à 350 km à l'ouest (Casco Bay, Stellwagen Bank), sur le même
   modèle et le même chemin de lecture ; elle valide le décalage, la
   rotation, l'analyse et l'amplitude en eau libre, pas l'amplitude de
   Fundy, qui repose sur une valeur de littérature à Minas Passage
   [supposé].
4. **32 jours à l'équinoxe, et 32 jours d'été en surface** : mêmes
   réserves qu'en section 7 (S2 et K1), plus la brise de mer absorbée par
   K1 (section 10e, Stellwagen) ; l'inférence FES et l'inférence CO-OPS
   concordent ici, ce qui n'était pas le cas dans Puget Sound où FES ne
   répondait pas.
5. **Surface** : couche `s_rho` supérieure à 0,5 m sous la surface par
   75 m d'eau (Vtransform 2 concentre les couches en surface), plus près de
   la surface encore que la couche sigma 0 de SSCOFS (1,6 %) ; les bins
   CO-OPS publiés sont à 11 à 28 m. L'écart de couche est du même ordre
   qu'en section 7 [supposé].
6. **Un jour UTC de GoMOFS commence à 19:00 la veille** (cycles 00 / 06 /
   12 / 18) et non à 22:00 (SSCOFS) : sans conséquence pour l'analyse, à
   savoir pour lire `record_start`.
7. **Moyenne sur les faces ouvertes** : le choix d'ignorer la face masquée
   surestime peut-être la cellule côtière par rapport à une moyenne avec
   zéro ; sur 7 mailles de large à Minas Passage, seules les deux cellules
   de bord sont concernées.

### 10h. CIOFS et CBOFS par le même chemin [vérifié sur une heure de chacun, `fields.n001` du 2026-09-19]

| Système | Fichier `fields` nowcast | `u`, blocs | Surface | Boîte d'essai | Par heure par `Range` | Écart contre lecture locale |
|---|---|---|---|---|---|---|
| CBOFS | 62 082 147 octets, cycles 00 / 06 / 12 / 18, `n001` à `n006` | `[1, 20, 291, 331]` en `[1, 10, 146, 166]` non compressés, 8 blocs, pas de `wetdry_mask_rho` | `s_rho` 19 (−0,025), 4 blocs de surface | embouchure de la Chesapeake et Hampton Roads, 36,8° à 37,3° N, −76,4° à −75,9° E : 1 506 cellules, pas médian 926 m, angle 20,7° | **0,13 Mo**, 5 requêtes | 0,0 |
| CIOFS | 587 516 625 octets, cycles 00 / 06 / 12 / 18, `n001` à `n006` | `[1, 30, 1044, 723]` en `[1, 10, 348, 241]` non compressés, 27 blocs, `wetdry_mask_rho` présent | `s_rho` 29 (−0,0167), 9 blocs de surface | Anchorage, Knik Arm et Turnagain Arm, 60,8° à 61,3° N, −151° à −149,5° E : 78 860 cellules, pas 79 / 148 / 298 m (p5 / médiane / p95), angle −75° à −11° | **3,6 Mo**, 19 requêtes | 0,0 ; 12 841 cellules à sec à cette heure, masque retrouvé à l'identique |

CIOFS est donc lisible à 3,6 Mo par heure au lieu de 588 (un mois en
moins de 3 Go sur le fil [supposé, extrapolé de l'heure mesurée]), avec un
pas de 37 à 616 m sur le domaine (médiane 175 × 205 m) et un angle qui
varie de −75° à +47° : c'est le cas où la rotation par cellule est
indispensable. DBOFS et TBOFS ont la même structure `fields` [supposé, non
lus ; ils sont dans `SYSTEMS` avec les cycles de la section 6]. WCOFS
(`2ds` avec un cycle 03 et `n001` à `n024`) n'est pas câblé.
