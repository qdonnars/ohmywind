# Spike NorKyst800 : la côte norvégienne à 800 m

Exploration du 2026-09-21, livrée sur la branche `feat/norkyst-spike`, en lecture
seule (rien de publié, rien de poussé). Question : le modèle côtier
NorKyst800 de MET Norway (THREDDS sans clé) peut-il alimenter, par analyse
harmonique, un atlas de courants de marée au format standard pour la
Norvège, là où Copernicus ne publie qu'un produit détidé ? Bout à bout sur
les Lofoten (Moskstraumen) et Saltstraumen.

Réponse courte : oui, la chaîne fonctionne de bout en bout en moins de cinq
minutes pour une boîte de 1,4° × 4° (32 jours téléchargés en 3 minutes,
analyse en 5 secondes, atlas de 7 Mo). Moskstraumen sort à 2,0 kt de
demi-grand axe M2 et 3,6 kt de courant de marée maximal reconstruit (le
modèle brut atteint 4,3 à 5,0 kt sur 32 jours), contre 4 à 6 kt publiés.
Saltstraumen est **de la terre** dans le modèle : à 800 m, un chenal de
150 m n'existe pas, et l'atlas y servirait 0,2 à 0,3 kt à un kilomètre d'un
courant de 20 kt. L'intégration au rang 1 est justifiée pour la côte
ouverte et les grands détroits, à condition d'un garde-fou explicite sur
les passes non résolues. **Un an d'archive** de la même boîte, téléchargé
dans l'après-midi (3 Go en 55 minutes, section 5b), résout 18 constituants
sans inférence et corrige le mois : Moskstraumen 3,3 kt, Vestfjorden 0,4 kt
au lieu de 0,7 kt (le mois faisait passer de la météo pour de la marée) ;
c'est l'atlas à publier, jamais le mois.

Chaque affirmation est **[vérifié]** (commande, fichier ou URL reproductible
le 2026-09-21) ou **[supposé]**.

## 1. Accès et licence

- L'URL fournie dans la demande,
  `https://thredds.met.no/thredds/fou-hi/norkyst800v2.html`, répond 404
  [vérifié]. Le catalogue racine (`/thredds/catalog.xml`) renvoie « Ocean
  and Ice » à `/thredds/catalog/fou-hi/fou-hi.xml` [vérifié] ; les liens
  relatifs de la page HTML racine sont cassés, seuls les chemins
  `/thredds/catalog/fou-hi/<nom>.xml` fonctionnent [vérifié].
- **NorKyst800 v2 est arrêté** : il est rangé dans `discontinued.xml` sous
  le titre « met.no ROMS NorKyst800m coastal ocean forecasting system
  (2019-2025, production ends Oct. 1. 2025) » [vérifié]. Son agrégat
  horaire `sea/norkyst800m/1h/aggregate_be` répond encore : 72 109 heures
  du 2017-02-20 au 2025-10-10, 16 niveaux, `u_eastward` / `v_northward` en
  float32 [vérifié sur le DDS et l'axe temps]. Non exploité ici.
- **Le successeur est NorKyst v3** (`/thredds/catalog/fou-hi/norkystv3.xml`,
  « met.no ROMS NorKyst v3 coastal ocean forecasting system (2024-) »)
  [vérifié]. Il expose :
  - l'agrégat horaire 800 m `fou-hi/norkystv3_800m_m00_be` (« ROMS
    Norkyst800m ZDepths Hourly Aggregation Best Estimates - reference
    member 00 »), utilisé ici, OPeNDAP à
    `https://thredds.met.no/thredds/dodsC/fou-hi/norkystv3_800m_m00_be`
    [vérifié] ;
  - deux emboîtements à **160 m**, Sulafjord (membre 70) et Oslofjord
    (membre 71), même format [vérifié dans le catalogue, non ouverts] ;
  - les fichiers journaliers (`norkystv3_his_files/AAAA/MM/JJ/`) : un
    fichier `norkyst800_his_zdepth_<date>T00Z_m00_AN.nc` de **4,1 Go** par
    jour pour tout le domaine en 3D [vérifié sur 2026-09-19]. Le
    sous-ensemble OPeNDAP est donc la seule voie raisonnable (8 Mo par jour
    pour notre boîte, section 3).
- **Licence** [vérifié le 2026-09-21] :
  - attribut global `license` de l'agrégat :
    `https://spdx.org/licenses/CC-BY-4.0 (CC-BY-4.0)` ;
  - page MET Norway
    <https://www.met.no/en/free-meteorological-data/Licensing-and-crediting> :
    « Data and products are licensed under Norwegian license for public
    data (NLOD) and Creative Commons 4.0 BY International », crédit à donner
    à « MET Norway » ;
  - la note `rights` du catalogue THREDDS dit encore « CC BY 3.0 »
    (métadonnée ancienne, l'attribut du jeu de données fait foi [supposé]).
  - Conclusion : redistribution du dérivé autorisée avec attribution, même
    régime que BSH ; l'atlas peut aller dans le dataset public. Les trois
    sources sont écrites dans `metadata.json` (`source.licence.evidence`).

## 2. Jeu de données et variables [vérifié sur le DDS et le DAS]

| Élément | Valeur |
|---|---|
| Grille | polaire stéréographique, 1148 × 2747 points, `proj4 +proj=stere +lat_0=90 +lat_ts=60 +lon_0=70 +x_0=3369600 +y_0=1844800`, `lat` / `lon` en tableaux 2D float64 |
| Emprise | 54,29° à 75,73° N, −4,61° à 37,55° E (Skagerrak, mer du Nord orientale, toute la côte norvégienne, Barents sud) |
| Maille | 800 m dans le plan de projection (échelle vraie à 60° N) ; **822 m au sol** mesurés aux Lofoten [vérifié sur deux voisins] |
| Courants | `u_eastward`, `v_northward` : int16, `scale_factor 0.001`, `_FillValue −32767`, m/s, `standard_name eastward/northward_sea_water_velocity`, `coordinates "lon lat"`, déjà tournés vers l'est et le nord (aucune rotation à faire) |
| Verticale | `depth[15]` = 0, 1, 2, 3, 5, 7, 10, 15, 25, 50, 65, 75, 100, 200, 300 m ; niveau 0 m pris ici |
| Temps | 23 855 instants horaires du 2024-01-01T00 au 2026-09-26T00 (999 jours), 5 trous d'un jour en 2024 (07/03, 13/05, 15/05, 12/08, 18/09) ; les cinq derniers jours sont de la prévision (`title` : « 120 hours ocean forecast ») |
| Autres | `zeta`, `w`, `temperature`, `salinity` ; chunks `[1, 1, 24, 2747]` (une ligne Y complète par bloc) |
| Marée | forçage TPXO 7.2 aux frontières d'après le résumé de la v2 [vérifié pour la v2] ; même principe pour la v3 [supposé] |

Le terme « best estimate » désigne un raccord des runs journaliers en
prenant pour chaque jour l'analyse la plus récente [supposé, non documenté
dans les attributs].

## 3. Volumes mesurés [vérifié, `build/norkyst/download.log`]

Boîte 66,9° à 68,3° N, 11,5° à 15,5° E (Lofoten, Vestfjorden,
Saltstraumen) :

- fenêtre d'indices `Y[535:813] × X[1612:1885]` = 278 × 273 = 75 894
  points, dont **52 178 en mer** (69 %) ;
- 32 jours du 2026-08-19 au 2026-09-19 (768 instants, avant les jours de
  prévision), niveau de surface, deux variables : **32 fichiers de 8,2 à
  8,5 Mo, 265 Mo au total** (float32, zlib 4 ; le fil transporte l'int16,
  environ 7 Mo par jour) ;
- **190 s de transfert cumulé**, 2 à 9 s par jour, requêtes séquentielles
  avec 1 s de pause, aucun échec ni relance (le script prévoit 5 essais à
  délai triplé) ;
- analyse harmonique : **4,6 s** pour 52 178 cellules × 768 h × 2
  composantes (13 constituants résolus + 4 inférés) ;
- atlas `NORKYST_LOFOTEN` : **28 042 cellules, 30 tuiles de 0,5°, 7,2 Mo**
  (257 octets par cellule, 17 constituants u et v plus les colonnes de
  diagnostic).

Commandes (depuis la racine du dépôt) :

```
env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with numpy --with polars \
  --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_norkyst_atlas.py --download --no-build --start 2026-08-19 --days 32 \
  --bbox 66.9 11.5 68.3 15.5 --source-dir build/norkyst --zone lofoten

env -u VIRTUAL_ENV uv run --with xarray --with netCDF4 --with numpy --with polars \
  --with pyarrow --with scipy --with-editable packages/data-adapters \
  scripts/build_norkyst_atlas.py --source-dir build/norkyst --zone lofoten \
  --atlas-id NORKYST_LOFOTEN --output-dir build/norkyst/atlas/NORKYST_LOFOTEN \
  --bbox 66.9 11.5 68.3 15.5 --tile-deg 0.5
```

## 4. Grille et rééchantillonnage [vérifié dans `scripts/build_norkyst_atlas.py`]

- L'analyse se fait **sur les cellules natives** (grille polaire), exactement
  comme `build_cmems_atlas.py` : cellules de terre écartées sur les 48
  premières heures (NaN), `GridAnalysis` par tranches de 96 h, critère de
  Rayleigh sur la durée totale, inférence des constituants non résolus
  depuis l'atlas de référence qui répond au centre du domaine.
- À 32 jours (767 h), 13 constituants résolus : M2, S2, N2, K1, O1, M4, MS4,
  Q1, MN4, M6, 2N2, L2, 2MS6. K2, P1, NU2 et MU2 sont inférés de FES2014
  au centre du domaine (`FES_GLOBAL` cellule 67,5625 N, 13,4375 E ; K2/S2
  0,277, P1/K1 0,257) ; MK4 n'est ni résolu ni inféré. `mean_is_weather`
  vaut vrai (moins de 30 jours).
- Les constantes sont ensuite **rééchantillonnées au plus proche voisin**
  sur une grille régulière de 0,0072° × 0,02° (801 m × 852 m à 67,5° N),
  alignée sur des multiples du pas, avec `scipy.spatial.cKDTree` dans un
  plan équirectangulaire local. Une cellule régulière à plus de 700 m de
  toute cellule native en mer est de la terre (la demi-diagonale d'une
  maille de 822 m vaut 581 m). Le filtre `--min-speed-kt 0.2` s'applique
  après le rééchantillonnage, sur ce que la cellule régulière porte.
- Résultat : grille 195 × 200 = 39 000 cellules, 31 740 à moins de 700 m
  d'une cellule native ajustée (distance médiane 332 m), **28 042 au-dessus
  de 0,2 kt** (88 %). La colonne `regrid_dist_m` garde la distance à la
  cellule native source.
- `metadata.json` : `rank 1`, `resolution_m 800`, `effective_resolution_m
  800`, `grid.origin "regrid"` avec le bloc `grid.regrid` (méthode, distance
  maximale, fenêtre d'indices native), `source.short "norkyst"`, `label
  "NorKyst800 (MET Norway), lofoten"`, `vertical "surface"` complété par
  `vertical_detail "z-level 0.0 m"`, `confidence "medium"` (option
  `--confidence`, `medium` par défaut ; le premier build appliquait la règle
  `resolution_m ≤ 1000` du script CMEMS et écrivait `high`, corrigé après
  la lecture de Saltstraumen, section 5 et 7).

## 5. Résultats

Demi-grand axe M2 en nœuds / inclinaison (° antihoraire depuis l'est) /
phase Greenwich, tels que servis par
`MarcAtlasRegistry.from_directory("build/norkyst/atlas").cell_at(lat, lon)`
puis `current_ellipse` [vérifié] :

| Point | Cellule servie (distance) | M2 | S2 / N2 / K1 (kt) | Max reconstruit (kt) | Brut 32 j à la cellule native (kt) | Publié |
|---|---|---|---|---|---|---|
| Saltstraumen 67,2303 N, 14,6164 E | 67,2372 N, 14,6300 E (966 m) | 0,20 / 37° / 321° | 0,03 / 0,03 / 0,01 | 0,26 | 0,64 | jusqu'à 20 kt dans un chenal de 150 m [supposé, chiffre de la demande] |
| Moskstraumen 67,80 N, 12,83 E | 67,7988 N, 12,8300 E (134 m) | 2,02 / 158° / 34° (demi-petit axe −0,65) | 0,74 / 0,54 / 0,16 | 3,60 (3,74 sur la cellule voisine 67,806 N, 12,83 E) | 4,31 (4,85 à moins de 3 km, 4,99 maximum du domaine en 67,8014 N, 12,9246 E) | 4 à 6 kt [supposé, chiffre de la demande] |
| Vestfjorden 67,5 N, 13,0 E (« large ») | 67,5036 N, 13,0100 E (585 m) | 0,52 / 11° / 247° (demi-petit axe −0,33) | 0,12 / 0,09 / 0,02 | 0,73 | 1,11 | aucune référence |

FES2014 (7 km) aux mêmes points : Saltstraumen 0,15 / 45° / 270°,
Moskstraumen 1,83 / 143° / 40°, Vestfjorden 0,14 / 29° / 258° [vérifié].

Variance expliquée par l'ajustement harmonique sur la série native
(1 − rmse² / variance) [vérifié] : Moskstraumen 89 % (u) et 79 % (v),
Vestfjorden 87 % et 85 %, cellule servie à Saltstraumen 46 % et 57 % (le
signal y est faible, 0,09 m/s d'écart-type).

Lecture :

- **Moskstraumen** : le modèle voit le maelström. Le courant de marée
  reconstruit (3,6 à 3,7 kt en vive-eau) vaut 60 à 90 % des 4 à 6 kt
  publiés, et le modèle brut monte à 5 kt avec la part non tidale (0,25 m/s
  de résidu en u, soit 0,5 kt). L'ellipse est nettement tournante
  (demi-petit axe 0,65 kt), inclinée NW-SE comme le détroit entre Lofotodden
  et Mosken. FES2014 donne déjà 1,83 kt à 7 km, avec une phase à 6° près de
  NorKyst : les deux modèles racontent la même marée, NorKyst la localise.
- **Saltstraumen** : la cellule native la plus proche (467 m) est de la
  terre, comme les cinq suivantes ; le premier point de mer est à 721 m
  (0,33 kt brut) et le plus fort dans un rayon de 3 km atteint 1,81 kt à
  2,9 km, dans l'approche du Saltfjorden [vérifié, carte des maxima bruts].
  L'atlas sert donc 0,2 kt de M2 et 0,26 kt de maximum à 966 m d'un chenal
  qui dépasse 20 kt : ce n'est pas une erreur du modèle, c'est l'absence du
  chenal dans une grille de 800 m. **Un atlas NorKyst servi tel quel à
  Saltstraumen serait pire que rien** : le runtime déduirait `high` de la
  résolution et éteindrait l'avertissement `currents.tidal_gap`.
- **Vestfjorden** : 0,52 kt de M2 là où FES2014 dit 0,14 kt. Le facteur 3,7
  n'est pas validable ici (pas d'observation) ; le fjord est large de 60 km
  et profond, et des courants de marée de l'ordre du demi-nœud y sont
  plausibles [supposé]. La variance expliquée à 85 % dit au moins que le
  signal NorKyst y est bien de la marée.
- Comparaison NorKyst contre FES2014 sur la boîte, 400 points tirés au
  hasard (`scripts/compare_atlases.py`, `build/norkyst/compare_fes.json`)
  [vérifié] : M2 de référence médian 0,15 kt, rapport d'amplitude
  p10 / médiane / p90 = 0,49 / 1,48 / 2,91, écart d'inclinaison 17° / 52°,
  écart de phase +9° / 58°. FES à 7 km n'est pas une référence dans un
  archipel : la dispersion mesure surtout ce que 7 km ne voit pas.
- Distribution du courant de marée maximal dans l'atlas [vérifié] : médiane
  0,43 kt, p90 0,71 kt, p99 1,84 kt, maximum 3,74 kt ; 1 174 cellules à 1 kt
  ou plus, 220 à 2 kt ou plus, aucune à 4 kt.

## 5b. Un an d'archive sur la même boîte [vérifié, `build/norkyst/download_1y.log`]

Téléchargement du 2025-09-19 au 2026-09-19 (366 jours, 8 784 instants) avec
les mêmes options : **366 fichiers, 3,0 Go, 55 minutes** (8 à 16 s par
jour, aucun jour sauté, aucune relance, les 32 fichiers du mois réutilisés).
Analyse en **37 s** : 18 constituants résolus (M2 S2 N2 K1 O1 M4 MS4 K2 P1
Q1 MN4 M6 2N2 NU2 MU2 L2 2MS6 MK4), aucune inférence, `mean_is_weather`
faux. Atlas `build/norkyst/atlas/NORKYST_LOFOTEN` : **23 052 cellules à
0,2 kt ou plus (72,6 % des cellules régulières), 29 tuiles, 6,4 Mo** ; le
mois est conservé dans `build/norkyst/atlas_32d/`.

| Point | 32 jours | Un an |
|---|---|---|
| Moskstraumen, cellule à 133 m : M2 / S2 / K2 (kt) | 2,02 / 0,77 / 0,21 (K2 inféré) | 2,09 / 0,82 / 0,17 (résolu) |
| Moskstraumen, maximum reconstruit à la cellule / à 1 km | 3,60 / 3,74 | 3,30 / 3,46 |
| Vestfjorden, cellule à 583 m : M2 / maximum | 0,52 / 0,73 | 0,27 / 0,38 |
| Saltstraumen, cellule servie / maximum à 3 km | 963 m, 0,26 / 0,40 (12 cellules) | 2 770 m, 0,27 / 0,32 (2 cellules) |
| Distribution des maxima : médiane / p90 / p99 / max | 0,43 / 0,71 / 1,84 / 3,74 | 0,31 / 0,59 / 2,00 / 3,46 |
| Cellules à 1 kt ou plus / 2 kt ou plus | 1 174 / 220 | 1 045 / 230 |

Lecture : là où le signal est fort et bien résolu (Moskstraumen), le mois
et l'année diffèrent de 8 % ; dans le fjord ouvert, le mois **surestime du
double** (Vestfjorden 0,73 contre 0,38 kt) parce qu'en 32 jours l'énergie
météorologique se glisse dans les bandes de marée, et la médiane du domaine
baisse de 0,43 à 0,31 kt. Autour de Saltstraumen, l'année laisse deux
cellules à plus de 0,2 kt dans un rayon de 3 km : la cellule servie recule à
2,8 km et le garde-fou de la section 7 reste indispensable. Conséquence pour
le coût : un an par boîte est le minimum, et l'estimation « 37 minutes par
boîte » de la section 6 devient 55 minutes mesurées.

## 5c. Toute la côte, un an, huit atlas [vérifié, `build/norkyst/coast_download.log` et `coast_build.log`]

Sept boîtes côtières en plus des Lofoten, téléchargées à la suite dans
l'après-midi et la soirée du 2026-09-21 (une connexion, un jour à la fois,
1 s de pause, 366 jours du 2025-09-19 au 2026-09-19, aucun jour sauté,
aucune relance) : **35 Go en 8 h 45** (13h43 à 22h29 ; le Vestland a pris
2 h 30 au lieu d'une heure, le serveur ayant ralenti en fin d'après-midi).
Analyse des sept en **7 minutes 45** (40 s à 115 s par boîte). Maille
régulière de 0,0072° en latitude et, en longitude, un pas choisi pour
800 m à la latitude moyenne de la boîte (0,013° au Skagerrak, 0,022° au
Finnmark). Helgeland porte une `validity_bbox` arrêtée à 66,9° N pour ne
pas chevaucher les Lofoten ; les autres boîtes se touchent sans se
recouvrir.

| Atlas | Boîte | Cellules ≥ 0,2 kt | Tuiles | Mo | Médiane / p99 / max (kt) | Cellules ≥ 1 kt |
|---|---|---|---|---|---|---|
| NORKYST_SKAGERRAK | 57,5 à 60 N, 7 à 12 E | 8 101 (15 %) | 14 | 2,4 | 0,36 / 0,77 / 1,35 | 24 |
| NORKYST_ROGALAND | 57,8 à 60 N, 4,5 à 7 E | 27 060 (78 %) | 19 | 7,2 | 0,32 / 0,68 / 1,22 | 11 |
| NORKYST_VESTLAND | 60 à 62,5 N, 4 à 7,5 E | 22 899 (68 %) | 23 | 6,4 | 0,31 / 0,58 / 1,26 | 5 |
| NORKYST_TRONDELAG | 62,5 à 65,5 N, 5 à 12 E | 99 020 (81 %) | 74 | 26,2 | 0,31 / 0,65 / 1,85 | 170 |
| NORKYST_HELGELAND | 65,5 à 66,9 N, 10,5 à 15 E | 17 272 (60 %) | 20 | 4,7 | 0,23 / 0,46 / 0,90 | 0 |
| NORKYST_LOFOTEN | 66,9 à 68,3 N, 11,5 à 15,5 E | 23 052 (73 %) | 29 | 6,4 | 0,31 / 2,00 / 3,46 | 1 045 |
| NORKYST_TROMS | 68,3 à 70,5 N, 14 à 21 E | 32 995 (54 %) | 53 | 9,1 | 0,33 / 1,51 / 5,25 | 1 596 |
| NORKYST_FINNMARK | 70 à 71,3 N, 21 à 31 E | 33 206 (73 %) | 54 | 9,2 | 0,65 / 1,54 / 4,54 | 2 572 |
| **Total** | | **263 605** | 286 | **72** | | |

Les huit ont 18 constituants résolus sans inférence. Le tableau raconte la
côte : au sud de 65° N la marée dépasse rarement 1 kt (Skagerrak, Rogaland,
Vestland, Trøndelag, la moitié des cellules sous 0,35 kt), Helgeland ne
dépasse jamais 0,9 kt, et tout le courant fort est au nord : Lofoten, Troms
(5,25 kt à Rystraumen, 69,556 N 18,747 E, contre 6 kt publiés [supposé]),
Finnmark (4,54 kt au Magerøysundet devant le cap Nord, 70,96 N 25,47 E).

Cellule servie par `MarcAtlasRegistry.cell_at` sur l'ensemble [vérifié] :
Moskstraumen à 133 m (3,30 kt), Rystraumen à 316 m (3,48 kt à la cellule,
5,25 kt à 3 km), Kvalsundet à 745 m (0,35 kt, 1,63 kt à 3 km), Drøbaksundet
à 438 m (0,45 kt), Karmsundet à 474 m (0,47 kt, 1,21 kt à 3 km), Stad à
129 m (0,44 kt), Hustadvika à 361 m (0,27 kt), Magerøysundet à 1,2 km
(0,37 kt, 1,08 kt à 3 km), Saltstraumen à 2,8 km (0,27 kt, toujours aveugle),
Sulafjord à 5 km (aucune cellule à 0,2 kt : le fjord n'a pas de marée
notable dans le modèle) ; au large du Skagerrak (58,5 N, 9,5 E) aucune
cellule, la cascade y descend sur Copernicus NWS puis SMOC, comme voulu.

**Publiés dans le dataset `Qdonnars/openwind-tidal-atlas` le 2026-09-21 à
22h45** (huit dossiers, 72 Mo, un commit chacun), Space dev redémarré en
usine. Le registre `sources.geojson` passe NorKyst en `current` avec les
huit atlas, `mask_norkyst.geojson` alimente la carte.

## 6. Coût d'un atlas complet [supposé, extrapolé des débits mesurés]

Débit mesuré : 6 s et 8,3 Mo par jour pour 75 894 points (1,4 Mo/s en
float32, environ 1,2 Mo/s sur le fil en int16).

| Étendue | Points de grille | Un jour | 32 jours | Un an | Temps (32 j / 1 an) |
|---|---|---|---|---|---|
| Boîte Lofoten (livrée, un an mesuré en 5b) | 75 894 | 8,3 Mo | 265 Mo | 3,0 Go | 3 min / 55 min mesurées |
| Domaine NorKyst entier, surface | 3 153 556 (41,5 × la boîte) | 345 Mo | 11 Go | 126 Go | 2,2 h / 25 h |

- Un an horaire est **disponible dès maintenant** dans l'agrégat v3
  (2024-01-01 à aujourd'hui, 999 jours) [vérifié sur l'axe temps] ; il
  résout K2, P1, NU2, MU2, L2 et MK4 sans inférence, comme pour Copernicus.
  Les cinq trous d'un jour de 2024 ne gênent pas `GridAnalysis` (trous par
  cellule tolérés).
- Le domaine entier est inutile : la moitié nord (Barents) et le large
  n'ont pas de courant de marée au-dessus de 0,2 kt [supposé]. Une bande
  côtière de 20 km du Skagerrak au cap Nord tient dans 15 à 25 % des points
  [supposé], soit 20 à 30 Go pour un an et 5 à 7 heures de transfert, en
  respectant le rythme séquentiel d'aujourd'hui. Le script accepte déjà une
  liste de boîtes en le lançant plusieurs fois avec `--zone` différent ; un
  atlas par boîte, comme MARC.
- L'atlas résultant pèserait 250 à 400 Mo pour la bande côtière (257 octets
  par cellule, 1 à 1,5 million de cellules gardées) [supposé] ; à un an, le
  temps d'analyse resterait de l'ordre de la minute par boîte (4,6 s pour
  32 jours sur 52 178 cellules, linéaire en instants).
- Alternative pour un long historique : l'agrégat v2 (2017 à 2025, même
  format de variables) reste servi mais arrêté ; il vaudrait pour une
  climatologie, pas pour un atlas à maintenir.

## 7. Limites

1. **800 m contre les passes.** Saltstraumen (150 m) n'existe pas dans la
   grille ; le même sort attend les autres « straumen » étroits de la côte
   (Godøystraumen, Rystraumen, les seuils de fjords) [supposé]. Les
   emboîtements à 160 m ne couvrent que Sulafjord et Oslofjord [vérifié dans
   le catalogue]. Il faut soit une liste de passes non résolues qui
   maintient `currents.tidal_gap` allumé et refuse l'atlas dans un rayon de
   2 à 3 km, soit une `validity_bbox` par boîte, soit une confiance
   `medium` posée par le builder plutôt que déduite de la résolution.
   Le builder écrit désormais `medium`, mais **le moteur ne lit pas ce
   champ** [vérifié dans `narrow_pass.confidence_for_point` et
   `routing/passage/engine.py`] : la confiance d'une étape est déduite du
   suffixe du libellé de source (`norkyst_lofoten_800m`, 800 ≤ 1000, donc
   `high`), et le champ `confidence` des métadonnées n'atteint que
   l'endpoint de couverture et la fiche de la carte. Le rejeu depuis le
   cache de prévisions du web (`CacheBackedAdapter`) n'a pas de registre
   d'atlas sous la main, donc la confiance doit rester déductible du
   libellé seul ou voyager avec les points. **Réponse retenue, livrée sur la
   même branche** : la liste des passes non résolues, mesurée. Le
   constructeur de la carte (`build_tidal_world_map.py --write-gaps`)
   compare, pour chaque passe du gazetteer et chaque atlas à 1 km ou plus
   fin qui la couvre, le courant maximal reconstruit à 3 km de la passe au
   courant de vive-eau publié ; sous la moitié, l'atlas est inscrit dans
   `unresolved_by` de la passe (`tidal_gaps.geojson`, monde entier, embarqué
   côté serveur et côté web). Au runtime, `confidence_for_point` rétrograde
   une source fine à `medium` à moins de 3 km d'une passe qui la liste, et
   le moteur lève l'avertissement `currents.pass_unresolved` (« passe non
   résolue par l'atlas de courants ») au lieu de `currents.tidal_gap`. Sur
   les Lofoten : Saltstraumen liste `norkyst_lofoten_800m` (0,4 kt à 3 km
   contre 8 kt publiés), Moskstraumen n'est listé pour personne (3,7 kt
   contre 6). Le même filet attrape déjà MARC MANGA en lisière de son
   domaine (raz de Lundy 0,15 kt, Shoots de la Severn 0,5 kt, canal de
   Bristol 0,5 kt, Escaut occidental 2,2 kt) et BSH DB 926 m au Scharhörn
   (1,9 kt, l'atlas Elbe à 90 m y répond avant lui).
2. **32 jours.** K2 et P1 inférés de FES2014, qui est faible et peu fiable
   dans l'archipel (section 5) ; `z0_*` reflète la météo d'un mois et les
   bandes de marée absorbent de l'énergie météorologique (Vestfjorden
   surestimé du double). Un an lève les trois points (fait, section 5b).
3. **Surface (0 m) et non moyenne verticale** : plus fort qu'un atlas
   `depth_averaged` (MARC) de 10 à 30 % dans les détroits [supposé] ; la
   légende doit le dire, comme pour BSH.
4. **Best estimate et prévision** : l'agrégat se termine cinq jours après
   aujourd'hui en prévision ; un téléchargement doit s'arrêter la veille
   (le script prend `--start` et `--days`, sans garde-fou automatique).
5. **Courant non tidal élevé** : à Moskstraumen, 0,25 m/s de résidu (11 %
   de la variance en u) que l'atlas ignore par construction ; le brut à 5 kt
   contre 3,7 kt reconstruits mesure cet écart. Le message utilisateur doit
   rester « marée seule ».
6. **Recouvrements** : l'emprise de NorKyst descend à 54,3° N et va jusqu'à
   −4,6° E, donc chevauche Copernicus NWS (rang 0, jusqu'à 63° N et 13° E),
   BSH baie allemande (rang 1, 926 m) et, au sud, la Baltique. Au rang 1,
   NorKyst à 800 m passerait devant BSH à 926 m à rang égal par la
   résolution : une `validity_bbox` limitée aux eaux norvégiennes (et au
   Skagerrak) est indispensable au moment du build.

## 8. Faut-il l'intégrer au rang 1 ?

Oui, sous trois conditions :

- **rang 1, 800 m, `confidence "medium"`** posée par le builder (fait,
  option `--confidence`) ; le moteur, lui, garde `high` à 800 m sauf à moins
  de 3 km d'une passe que la mesure du constructeur de la carte déclare non
  résolue par cet atlas (fait, section 7, point 1) ; à revoir quand une
  validation contre les tables de courant norvégiennes (Kartverket) aura
  été faite [supposé qu'elles existent en libre accès] ;
- **un an d'archive** par boîte (3 Go et 40 minutes par boîte de 1,4° × 4°),
  en boîtes côtières du Skagerrak au cap Nord, avec `validity_bbox` par
  atlas pour ne pas marcher sur BSH ni sur la Baltique ;
- **un garde-fou sur les passes** (fait) : les étapes à moins de 3 km d'une
  passe connue que l'atlas servi ne résout pas (Saltstraumen en tête)
  passent en confiance `medium` et reçoivent `currents.pass_unresolved`,
  « passe non résolue par l'atlas de courants », quel que soit l'atlas qui
  répond ; la liste vient de la mesure, pas d'une largeur de passe saisie à
  la main, et se recalcule à chaque `--write-gaps`.

Vis-à-vis de Copernicus NWS, NorKyst est complémentaire, pas concurrent :
NWS s'arrête à 63° N, NorKyst couvre toute la côte jusqu'à Vardø et
localise les détroits que 1,5 km lisse (Moskstraumen à 3,7 kt contre rien
chez Copernicus, qui ne publie que du détidé en Arctique). Au sud de 63° N,
sur la côte ouest norvégienne et le Skagerrak, NorKyst au rang 1 passe
devant NWS au rang 0, ce qui est le comportement voulu pour un modèle deux
fois plus fin et côtier.

## 9. Fichiers produits (non trackés)

- `scripts/build_norkyst_atlas.py` : téléchargement et construction (ruff
  propre).
- `build/norkyst/norkyst_lofoten_AAAAMMJJ.nc` : 366 fichiers, 3,0 Go (du
  2025-09-19 au 2026-09-19).
- `build/norkyst/atlas/NORKYST_LOFOTEN/` : l'atlas d'un an, 29 tuiles,
  `metadata.json`, `coverage.geojson`, 6,4 Mo ; `build/norkyst/atlas_32d/` :
  le mois, 30 tuiles, 7,2 Mo.
- `build/norkyst/download.log`, `build/norkyst/download_1y.log`,
  `build/norkyst/build.log`,
  `build/norkyst/compare_fes.json`, `build/norkyst/grid_latlon.npz` (lat/lon
  2D de tout le domaine, 50 Mo), `build/norkyst/native_max_speed_ms.npy`
  (maximum brut par cellule native sur 32 jours).
