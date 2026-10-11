# Spike Copernicus Arctique avec marée : l'Islande à 3 km

Exploration du 2026-09-22, sur la branche `feat/tidal-sources-objective`, en
local (rien de publié, rien de poussé). Question : quels trous de la zone
objectif restent sans source fine, lesquels ont une source ouverte plus fine
que ce que la cascade sert, et peut-on en intégrer une de bout en bout comme
NorKyst ?

Réponse courte : **un seul trou « rouge » de la carte est dans la zone
objectif, l'Islande**, et une source ouverte y existe que le registre ne
connaissait pas : le produit Copernicus **ARCTIC_ANALYSISFORECAST_PHY_TIDE_002_015**
(HYCOM 3 km, marée incluse, courants de surface toutes les 15 minutes depuis
2018), distinct du produit Arctique détidé qu'on avait écarté. Un an autour de
l'Islande se télécharge en 7 minutes (2,6 Go horaires), s'analyse en une
minute (18 constituants, aucune inférence) et donne un atlas de 16 652
cellules, 9,3 Mo, au rang 0. Il retrouve la hauteur de marée M2 de Reykjavik
à 10 % et 1° près (TICON-4, 51 ans), s'accorde avec FES2014 sur le courant
M2 (rapport médian 1,07, phase médiane −4°) et localise le raz de Látrabjarg
(Látraröst) à 3,0 kt de courant de marée maximal. Les autres trous restent :
les sounds écossais ont une excellente source technique (SAMS WeStCOMS et
NORSCOMS, maillage de 100 m) **sans licence publiée**, Messine, l'Euripe,
Gibraltar fin, les passes galloises et nord-irlandaises n'ont toujours rien
d'ouvert.

Chaque affirmation est **[vérifié]** (commande, fichier ou URL reproductible
le 2026-09-22) ou **[supposé]**.

**Mise à jour du 2026-09-22 au soir** [vérifié] : l'atlas `CMEMS_ARC_ICELAND` est publié dans le dataset `Qdonnars/openwind-tidal-atlas` et servi par le Space dev (Látraröst, 65,49 N 24,55 W, répond `cmems_iceland_3000m`). Carte régénérée : à l'intérieur de la zone objectif, la surface à plus de 1,5 kt sans source passe de 0,42 degré carré (toute en Islande) à zéro ; ne restent que des passes, listées en section 0.

## 0. Trous de la zone objectif et sources vérifiées

Lecture de `map/status.geojson`, `map/gaps.geojson` et du registre, coupés à
`map/objective.geojson` [vérifié, shapely] :

- **zones à plus de 1,5 kt sans source fine** : aucune zone orange ni
  violette dans l'objectif ; neuf polygones rouges (0,43 deg²), **tous en
  Islande** : cap oriental (64,2 à 65,25 N, 14,6 à 12,9 W, 0,32 deg²) et
  Westfjords autour de Látrabjarg (65,4 à 66,1 N, 24,9 à 23,7 W, 0,10 deg²),
  plus trois éclats de pixel au bord de NorKyst (68,30 N) ;
- **passes** : violettes (NWS 1,5 km seul, ou MANGA 700 m aveugle) pour 23
  passes britanniques, irlandaises et néerlandaises ; Gibraltar violet (IBI
  3 km, Puertos del Estado fermé) ; rouges : Messine (MED 4,2 km), Euripe,
  Bosphore, Dardanelles (sans source), Saltstraumen (NorKyst aveugle).

| Trou | Servi aujourd'hui | Source plus fine vérifiée le 2026-09-22 | Licence lue | Verdict |
|---|---|---|---|---|
| Islande (Látraröst, cap oriental, Westfjords) | FES2014 non publié, SMOC 8 km | **Copernicus Arctique avec marée, 3 km** | Licence Copernicus Marine [vérifié] | **intégré** (atlas construit, section 5) |
| Breiðafjörður intérieur | rien | même produit : **terre** dans la grille de 3 km [vérifié] | | reste un trou (hors gazetteer) |
| Féroé | NWS 1,5 km | Havstovan : modèle 0,5 nm décrit dans un rapport, seul un PDF est publié (Zenodo 7701767, CC BY 4.0) [vérifié] | | rien de plus fin d'ouvert |
| Sounds de l'ouest écossais (Corryvreckan, Kyle Rhea, Cuan, Falls of Lora, Mull of Kintyre) | NWS 1,5 km | **SAMS WeStCOMS v3** (FVCOM, 951 éléments à moins de 2 km de Corryvreckan, horaire 2025-2026 sur thredds.sams.ac.uk) [vérifié] | **aucun texte** : « freely available » sur la page THREDDS de SAMS, pas d'attribut `license` [vérifié] | `clarify`, à demander à SAMS |
| Pentland Firth, Merry Men, Orcades, Sumburgh | NWS 1,5 km | **SAMS NORSCOMS v1** (155 éléments à moins de 2 km du Pentland) [vérifié] ; SSW-RS (OGL, JASMIN en 401 sans inscription) [vérifié] | aucune pour NORSCOMS ; OGL pour SSW-RS | `clarify` |
| Galles, canal de Bristol, Menai, Irlande du Nord | NWS 1,5 km ou MANGA aveugle | rien de nouveau : Marine Institute ne couvre pas ces eaux | | UKHO seul, fermé |
| Côte ouest irlandaise | NWS 1,5 km, IBI 3 km | Marine Institute **CONN2D 200 m** (barotrope, CC BY 4.0) [vérifié] ; NEATL 1,4 km (plus grossier que NWS) | CC BY 4.0 (attribut `license`) [vérifié] | ouvert mais fenêtre glissante de 8 jours : archivage à monter ; marée modérée [supposé] |
| Kattegat, Belts, Øresund | NWS 1,5 km (jusqu'à 13 E) | Copernicus Baltique 1 mille nautique [vérifié] ; DMI écarté (clé) | Copernicus | aucun gain |
| Galice, rías | IBI 3 km | MeteoGalicia ROMS et MOHID (≈ 300 m) | **CC BY-SA 4.0** (datos.gob.es) [vérifié] | `clarify` (share-alike) |
| Estuaires portugais (Tage) et marocains | IBI 3 km | MARETEC MOHID Tage : ni portail de données ni licence trouvés | | rien d'ouvert trouvé |
| Gibraltar | IBI 3 km | rien (Puertos del Estado fermé, déjà au registre) | | inchangé |
| Messine | MED 4,2 km | CMCC SANIFS (SHYFEM 50 à 500 m, marée OTPS) : domaine sans mention de Messine, serveurs `sanifs.cmcc.it` et `oceanlab.cmcc.it` injoignables, aucune licence [vérifié] | | inchangé, rouge |
| Adriatique nord, Venise | MED 4,2 km | non cherché en profondeur | | inchangé |
| Euripe, Égée | rien | rien trouvé | | inchangé, rouge |
| Bosphore, Dardanelles | rien | **Copernicus mer Noire, emboîtement Marmara 500 m** horaire [vérifié] | Copernicus | courant **non tidal** : pas d'atlas harmonique, candidat pour une couche de prévision |
| Saltstraumen | NorKyst 800 m aveugle | emboîtements NorKyst 160 m : Sulafjord et Oslofjord seulement [vérifié le 2026-09-21] | | inchangé |

Toutes ces sources sont au registre `map/sources.geojson` (sept entrées
nouvelles, deux relues), avec licence, URL et date de lecture.

## 1. Accès et licence

- Produit **ARCTIC_ANALYSISFORECAST_PHY_TIDE_002_015**, « Arctic Ocean Tidal
  Analysis and Forecast », DOI 10.48670/moi-00005 [vérifié,
  `copernicusmarine describe`]. Description du producteur : « HYCOM model at
  3 km resolution forced with tides at its lateral boundaries […] surface
  currents and sea surface heights, provided at 15 minutes frequency, which
  therefore include […] tides and storm surge signals » [vérifié].
- À ne pas confondre avec `ARCTIC_ANALYSISFORECAST_PHY_002_001`, dont tous les
  jeux de courant portent `detided` dans leur nom [vérifié] : c'est celui que
  le README écartait à raison.
- Jeu `dataset-topaz6-arc-15min-3km-be`, version `202003`, trois parties :
  `default` (fichiers natifs seulement), `lowResolution` (grille lat/lon à
  0,06°, soit 6,7 km en latitude, sans intérêt face à FES) et `originalGrid`
  (grille native polaire stéréographique, `x` / `y` en centaines de km,
  `latitude` / `longitude` 2D, magasins ARCO « time-series » et
  « geo-series ») [vérifié].
- Licence Copernicus Marine relue le 2026-09-22
  (<https://marine.copernicus.eu/user-corner/service-commitments-and-licence>) :
  section 2.2, « modify, adapt, develop, create and distribute Value Added
  Products or Derivative Work from Copernicus Marine Service Products for any
  purpose », attribution « Generated using E.U. Copernicus Marine Service
  Information; <DOI> » [vérifié]. Même régime que NWS, IBI et MED, déjà
  publiés.

## 2. Jeu de données et variables [vérifié, `copernicusmarine.open_dataset`]

| Élément | Valeur |
|---|---|
| Grille | polaire stéréographique, 2 367 × 2 467 points, pas de 0,03 (3 km) en `x` et `y` ; **2,86 km au sol** mesurés en Islande |
| Emprise | latitude ≥ 41,1 N ; au sud, le bord descend à 41,6 N vers 5 W et remonte à 57 N vers 45 E (Islande, Féroé, Norvège, Barents, Groenland, et aussi Gascogne et mer du Nord où NWS et IBI sont plus fins) |
| Courants | `vxo`, `vyo` (`sea_water_x_velocity`, `sea_water_y_velocity`), m/s, **le long des axes de la grille** : il faut les tourner vers l'est et le nord |
| Autres | `zos` (hauteur de surface), `model_depth` |
| Temps | 306 720 pas de 15 minutes du 2018-01-01 au 2026-09-30T23:45, les dix derniers jours en prévision |
| Découpage ARCO | time-series : blocs de 5 280 quarts d'heure (55 jours) × 32 × 800 cellules |

Rotation : l'angle de l'axe `x` est calculé en chaque cellule par
différences centrées des latitude / longitude 2D dans un plan
équirectangulaire local ; la grille étant conforme, l'axe `y` est l'axe `x`
tourné de +90° (vérifié : un pas en `y` fait 65,4° depuis l'est au centre de
la boîte, un pas en `x` −24,6°). Sur la boîte, l'angle de `x` va de −37° à
−17° [vérifié, variable `grid_x_angle_deg` des fichiers téléchargés].

## 3. Volumes mesurés [vérifié, `build/cmems_arc/download_1y.log`]

Boîte 62,9 à 67 N, 25 à 12,5 W (l'Islande entière et son plateau) :

- fenêtre d'indices `Y[470:705] × X[1496:1752]` = 60 160 points, dont
  **46 534 en mer** ;
- estimations `dry_run` de la toolbox avant téléchargement : un an sur le
  magasin time-series = 18,4 Go transférés (16,3 Go de fichier à 15 minutes),
  32 jours = 5,3 Go (le bloc de 55 jours est lu en entier), et le magasin
  geo-series coûterait 25 Go pour 32 jours ;
- téléchargement du 2025-09-20 au 2026-09-19 (**8 760 heures**) par blocs
  alignés sur le découpage ARCO (aucun bloc lu deux fois), sous-échantillonnés
  à l'heure, tournés et écrits en float32 compressé : **7 fichiers, 2,6 Go sur
  disque, 7 minutes** (35 à 55 s par bloc de 55 jours, ouverture du magasin
  comprise, 19h35 à 19h42), aucune relance ;
- analyse harmonique et rééchantillonnage : **60 s** pour 46 534 cellules ×
  8 760 h × 2 composantes.

Commandes, depuis la racine du worktree, les deux variables
`COPERNICUSMARINE_SERVICE_USERNAME` / `..._PASSWORD` dans l'environnement :

```
env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with numpy --with polars \
  --with pyarrow --with scipy --with httpx --with copernicusmarine \
  --with-editable packages/data-adapters scripts/build_cmems_arctic_atlas.py \
  --download --no-build --start 2025-09-20 --end 2026-09-20 \
  --bbox 62.9 -25 67 -12.5 --source-dir build/cmems_arc --zone iceland

env -u VIRTUAL_ENV uv run (mêmes --with) scripts/build_cmems_arctic_atlas.py \
  --source-dir build/cmems_arc --zone iceland --atlas-id CMEMS_ARC_ICELAND \
  --output-dir build/cmems_arc/atlas/CMEMS_ARC_ICELAND \
  --reference-atlas-dir build/fes/atlas \
  --bbox 62.9 -25 67 -12.5 --validity-bbox 63 -25 67 -12.5
```

## 4. Grille et rééchantillonnage [vérifié dans `scripts/build_cmems_arctic_atlas.py`]

Même chemin que NorKyst : analyse sur les cellules natives (terre = NaN sur
les 48 premières heures), `GridAnalysis` par tranches de 96 h, Rayleigh sur
la durée totale, puis plus proche voisin vers une grille régulière de
0,026° × 0,06° (2,9 × 2,8 km à 65 N), une cellule régulière à plus de
2 100 m de toute cellule native en mer étant de la terre (demi-diagonale
d'une maille de 2,86 km : 2 020 m), filtre à 0,2 kt.

- 365 jours : **18 constituants résolus** (M2 S2 N2 K1 O1 M4 MS4 K2 P1 Q1
  MN4 M6 2N2 NU2 MU2 L2 2MS6 MK4), aucune inférence, `mean_is_weather` faux ;
- grille régulière 158 × 209 = 33 022 cellules, 19 537 à moins de 2,1 km
  d'une cellule native ajustée (distance médiane 1 146 m), **16 652 au-dessus
  de 0,2 kt** (85 %) ;
- `metadata.json` : `rank 0` (bassin, 2 km ou plus, comme NWS, IBI, MED et
  FES), `resolution_m 3000`, `effective_resolution_m 2900`, `confidence
  medium`, `validity_bbox [63, -25, 67, -12.5]` (NWS s'arrête à 63 N et ne
  chevauche donc pas ; au rang 0, NWS à 1,5 km passerait de toute façon
  devant), `source.short "cmems"`, zone `iceland`, libellé servi
  `cmems_iceland_3000m`, `vertical "surface"`.

## 5. Résultats

Cellule servie par `MarcAtlasRegistry.from_directory("build/cmems_arc/atlas").cell_at`,
ellipse M2 par `current_ellipse` ; FES2014 (`build/fes/atlas`) au même point
[vérifié] :

| Point | Cellule (distance) | M2 (kt) / incl. / phase | S2 / N2 / K1 (kt) | Max reconstruit, cellule / à 3 km (kt) | Brut un an (kt) | FES2014 M2 |
|---|---|---|---|---|---|---|
| Látraröst 65,50 N 24,58 W | 0,9 km | 2,04 / 112° / 214° | 0,69 / 0,42 / 0,26 | 3,01 / 3,01 | 3,96 | 1,21 / 125° / 242° |
| Westfjords, zone rouge 65,58 N 24,60 W | 1,5 km | 1,55 / 68° / 225° | | 2,34 / 2,51 | | 1,43 / 89° / 236° |
| Cap oriental, zone rouge 64,91 N 13,40 W | 0,5 km | 1,05 / 67° / 227° | 0,33 / 0,23 / 0,13 | 1,68 / 1,74 | 2,28 à 3 km | 0,83 / 63° / 224° |
| Reykjanesröst 63,8 N 22,75 W | 1,4 km | 0,88 / 128° / 124° | | 1,32 / 1,32 | | 0,99 / 126° / 123° |
| Horn 66,46 N 22,4 W | 1,1 km | 0,75 / 164° / 102° | | 1,15 / 1,15 | | 0,65 / 143° / 100° |
| Vestmannaeyjar 63,42 N 20,3 W | 0,9 km | 0,53 / 146° / 77° | | 0,82 / 0,84 | | 0,49 / 142° / 78° |
| Breiðafjörður, entrée 65,2 N 23,3 W | 0,7 km | 0,20 / 16° / 113° | | 0,30 / 0,30 | 0,63 | 0,68 / 23° / 114° |
| Breiðafjörður intérieur (Stykkishólmur) | aucune cellule : terre dans la grille | | | | | 0,62 |

Distribution du courant de marée maximal de l'atlas [vérifié] : médiane
0,45 kt, p90 1,24, p99 1,82, maximum 3,01 kt (Látraröst) ; 2 437 cellules à
1 kt ou plus, 1 034 à 1,5 kt, 78 à 2 kt, une à 3 kt. Variance expliquée par
l'ajustement à Látraröst ≈ 88 % (u) et 98 % (v), au cap oriental ≈ 78 % et
93 % (écart-type de la série native voisine, rmse de la cellule servie)
[vérifié, approximatif car les deux cellules ne coïncident pas exactement].

Lecture :

- **Látraröst** est le point le plus fort de l'Islande dans le modèle,
  comme dans le masque FES qui y dessinait la zone rouge : 2,0 kt de M2,
  3,0 kt de maximum reconstruit, 4,0 kt bruts sur l'année (la part non tidale
  y ajoute près d'un nœud). FES à 7 km donne 1,2 kt avec 28° de retard. Aucune
  valeur publiée ouverte n'a été trouvée pour ce raz (instructions nautiques
  islandaises non consultées) : l'ordre de grandeur « 3 à 4 kt » est
  **[supposé]**.
- **Les deux zones rouges** passent au-dessus de 1,5 kt dans l'atlas (2,3 à
  2,5 kt aux Westfjords, 1,7 kt au cap oriental) : elles sont réelles et
  désormais servies à 3 km au lieu de 7 km.
- **Breiðafjörður** : la baie aux îles (marnage de 6 m [supposé, Wikipédia])
  est de la terre ou quasi à 3 km, et l'entrée ne dépasse pas 0,3 kt de
  maximum reconstruit, trois fois moins que FES. Le modèle ne voit pas les
  détroits entre les îles : pour la navigation dans le Breiðafjörður, cet atlas
  est faux par défaut. Aucune entrée du gazetteer n'y existe aujourd'hui, donc
  aucun garde-fou `currents.pass_unresolved` ne s'y déclenchera.

### 5b. Validation indépendante [vérifié]

- **Hauteur de marée à Reykjavik** : analyse harmonique de `zos` (même
  modèle, même jeu) sur 49 jours (2026-08-02 au 2026-09-19, horaire) à la
  cellule de mer la plus proche du marégraphe (64,161 N, 22,071 W, 6,5 km,
  24 m de fond), contre **TICON-4** (Hart-Davis et al., SEANOE, 51 ans de
  mesures GESLA-4 à `reykjavik-reyk-isl-icg`, « No obvious issues ») :

  | Constituant | Modèle | TICON-4 | Écart |
  |---|---|---|---|
  | M2 | 118,1 cm / 182,4° | 131,6 cm / 183,6° | −10 %, −1,2° (2 minutes d'avance) |
  | S2 | 53,4 cm / 231,1° | 51,4 cm / 220,9° | +4 %, +10° (20 minutes) |

  La marée entre donc dans le bon tempo : ce que l'atlas de courant hérite du
  forçage aux frontières est juste à Reykjavik. TICON-3 (utilisé pour ATLNE)
  n'a aucune station islandaise ; TICON-4 n'en a qu'une.
- **FES2014, 400 points au hasard dans la boîte**
  (`scripts/compare_atlases.py --bbox 63 -25 67 -12.5 --points 400`,
  `build/cmems_arc/compare_fes.json`) : M2 de référence médian 0,25 kt,
  rapport d'amplitude p10 / médiane / p90 = **0,77 / 1,07 / 1,30**, écart
  d'inclinaison médian 6° (p90 26°), écart de phase médian **−4°** (p90 26°).
  Deux modèles indépendants (HYCOM forcé aux frontières, FES assimilant
  l'altimétrie) racontent la même marée sur le plateau islandais ; la
  dispersion est au bord de la côte, là où 7 km ne voit pas.
- Aucune observation de courant ouverte n'a été trouvée en Islande
  (l'institut MFRI annonce un ROMS côtier mais ne publie rien) : le courant
  lui-même reste **non validé localement**, d'où `confidence medium`.

## 6. Coût d'un atlas complet

- L'Islande entière est faite : un an, 7 minutes, 2,6 Go, 9,3 Mo d'atlas
  [vérifié]. Refaire l'année suivante coûte la même chose.
- Ailleurs dans la zone objectif, ce produit est plus grossier que ce qui est
  servi (NWS 1,5 km, IBI 2,5 à 3 km, NorKyst 800 m) : aucun autre atlas à en
  tirer [vérifié par l'emprise]. Hors objectif, il couvrirait le Groenland,
  la mer Blanche et Barents à 3 km [supposé utile].
- L'archive remonte à 2018 : un atlas de deux ou trois ans serait possible
  pour quelques minutes de plus [supposé, débit linéaire].

## 7. Limites

1. **3 km contre les fjords et les détroits** : le Breiðafjörður intérieur,
   les fjords de l'est et les sounds des Westfjords sont de la terre ou
   quasi dans la grille. L'atlas est un atlas de plateau et de caps, pas de
   passes. Il faudrait des entrées de gazetteer islandaises (Breiðafjörður,
   Hvammsfjörður, Látraröst) pour que la mesure `unresolved_by` et
   l'avertissement `currents.pass_unresolved` jouent ; aujourd'hui une étape
   à 3 km passe en `medium` par sa seule maille (au-delà de 1 km), ce qui est
   le bon niveau.
2. **Surface HYCOM, pas moyenne verticale** : plus fort qu'un atlas
   `depth_averaged` dans les zones stratifiées [supposé].
3. **Pas de validation de courant** : seule la hauteur à Reykjavik et l'accord
   avec FES sont vérifiés.
4. **Toolbox Copernicus obligatoire** et compte : le builder lit le magasin
   ARCO par `copernicusmarine.open_dataset`, par blocs de 55 jours ; la queue
   de l'axe est de la prévision, `--end` doit rester avant aujourd'hui.
5. Le builder duplique la partie « build » de `build_norkyst_atlas.py`
   (même logique, métadonnées différentes), comme les builders précédents.

## 8. Faut-il l'intégrer ?

Oui, au **rang 0, 3 km, `confidence medium`**, avec la `validity_bbox`
islandaise : c'est la seule source ouverte plus fine que FES2014 sur les deux
zones rouges de l'objectif, elle est sous la même licence que les trois
atlas Copernicus déjà publiés, et un an se reconstruit en dix minutes.
Publication : déposer `CMEMS_ARC_ICELAND` dans le dataset public comme les
autres atlas Copernicus, puis relancer `build_tidal_world_map.py` (le motif
`cmems_arc/atlas/*/coverage.geojson` est ajouté à `BUILT_ATLAS_PATTERNS`) :
tant que l'atlas n'est pas servi, les deux zones islandaises passent en
orange (source ouverte à portée) ; une fois servi, en vert.

## 9. Fichiers produits

- `scripts/build_cmems_arctic_atlas.py` (tracké) : téléchargement par blocs
  ARCO, rotation, construction (ruff propre).
- `build/cmems_arc/arctic_iceland_AAAAMMJJ_AAAAMMJJ.nc` : 7 fichiers, 2,6 Go
  (non trackés).
- `build/cmems_arc/atlas/CMEMS_ARC_ICELAND/` : 161 tuiles, `metadata.json`,
  `coverage.geojson`, 9,3 Mo.
- `build/cmems_arc/download_1y.log`, `build/cmems_arc/build.log`,
  `build/cmems_arc/compare_fes.json`,
  `build/cmems_arc/native_max_speed_ms.npy` (maximum brut par cellule native
  sur l'année).
- `build/ticon/ticon4.csv` (TICON-4, SEANOE, 47 Mo) et `build/ticon/TICON_3.txt`.
