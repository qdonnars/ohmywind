# Spike BSH : un atlas harmonique de la baie allemande et de l'Elbe en une journée

Source : prévisions de courant de surface du BSH (Bundesamt für Seeschifffahrt
und Hydrographie), `ftp://ftp.bsh.de/Stroemungsvorhersagen/`, GRIB2, licence
CC BY 4.0 (`LICENSE.txt` du FTP daté du 3 août 2026, lu le 2026-09-19).
Passage-test : Cuxhaven → Helgoland, et le chenal Cuxhaven → Brunsbüttel.

Tout ce qui suit est reproductible avec les trois scripts de
`scripts/` (`archive_bsh_currents.py`, `build_bsh_atlas.py`,
`validate_bsh_atlas.py`) et les artefacts sous `build/bsh/` (gitignoré).

## Pourquoi BSH

- La seule source qui résout l'Elbe (90 m) et la baie allemande (0,5 nm,
  soit 909 × 928 m mesurés sur la grille) **sans compte** ; CMEMS NWS aurait
  donné 1,5 km avec un compte Copernicus qu'il n'y a pas en local.
- Licence la plus simple du dossier : CC BY 4.0, dérivés redistribuables,
  attribution « Data provided by Bundesamt fuer Seeschifffahrt und
  Hydrographie (BSH), CC BY 4.0 », modifications à indiquer.
- Le produit est une **prévision** (marée + vent + densité + débits), pas
  des constantes : c'est le cas « séries à analyser » de la direction
  retenue, donc le bon spike pour éprouver le builder générique.

## Ce que contient le produit [vérifié avec eccodes, 2026-09-19]

- GRIB2, discipline 10, catégorie 1, paramètres 2 (u, est) et 3 (v, nord),
  m/s, sans nom dans les tables eccodes (« unknown ») ; niveau « 1 m »
  déclaré, mais le README dit **moyenne de la surface à 5 m** (ou au fond si
  moins profond). 96 messages par composante et par fichier, de 00:15 à
  24:00 UTC, pas de 15 min. Valeur manquante 9999 sous bitmap, masque
  constant dans le temps (pas de marquage des estrans découvrants).
- Grilles régulières lat/lon : `idb` 123 × 90 à 0,00833° × 0,01389°
  (7,76 à 8,99 E, 53,23 à 54,25 N), `db` 387 × 240 (6,17 à 9,49 E, 53,23
  à 56,45 N), `CuxBru` 156 × 410 à 0,000833° × 0,001389° (≈ 93 × 91 m),
  `AusAlt` 72 960 cellules.
- Nommage `Current_<zone>_<YYYYMMDDHH>_<VV>` : **le run de 12 UTC numérote
  `_01` le jour même** (ses douze premières heures sont un hindcast), le run
  de 00 UTC numérote `_00`. Découvert sur les dates de validité des
  messages ; le builder vérifie chaque fichier contre cette règle.
- Rétention sur le FTP : 3 jours (Elbe : 12 runs, du 16/09 12 UTC au 19/09
  00 UTC ; mer du Nord : le seul run du 19/09 00 UTC, jours 0 à 2).
- Modèle derrière le produit [source : page BSH « Hydrodynamik » et
  Brüning et al. 2021, Hydrographische Nachrichten 118, lus par la
  recherche déléguée] : HBM (HIROMB-BOOS), 35 couches en mer du Nord, 25
  en baie allemande, **7 dans l'Elbe** ; forçage de marée par 19
  constituants à la frontière ouverte (liste non publiée) ; pas
  d'assimilation de marégraphes. **Le BSH ne publie aucun RMSE de courant**
  pour la baie allemande : validation indirecte par bouées dérivantes
  (Callies et al. 2017, Ocean Science 13 : erreur médiane de position 4,6 km
  à 25 h, et la moyenne 0 à 5 m sous-représente la dérive de surface).

## Méthode

1. **Archive** : `archive_bsh_currents.py` liste le FTP (`ftplib`, stdlib),
   rapatrie les `.grb2.bz2` absents, écrit un manifeste JSONL (nom, taille,
   sha256, heure). Idempotent. 63 fichiers, 380 Mo, en 4 minutes.
2. **Série par cellule** : pour chaque instant de 15 min, le fichier au
   délai de prévision le plus court (le hindcast du run le plus récent
   gagne). Les jours tenus à l'écart pour la validation sont retirés ici.
3. **Analyse harmonique** : `openwind_data.currents.harmonic_analysis`
   (nouveau, numpy seulement). Moindres carrés dans la convention exacte du
   prédicteur (mêmes V0, u, f), `GridAnalysis` accumule les équations
   normales fichier par fichier (mémoire bornée, correction par cellule des
   trous). Constituants résolus choisis par le critère de Rayleigh sur la
   longueur d'enregistrement ; les autres **inférés** : liés à leur
   partenaire résolu par le rapport d'amplitude et le retard de phase lus
   dans MARC ATLNE à la cellule la plus proche du centre de la zone
   (S2, N2, K2, 2N2 sur M2 ; O1, P1, Q1 sur K1 ; MS4, MN4, MK4 sur M4).
   L'inférence est contrainte dans la régression (un paquet à deux
   inconnues par groupe), pas appliquée après coup.
4. **Écriture** au format standard (`docs/harmonic_atlas_format.md`) :
   tuiles 0,5°, `metadata.json` schéma 3 avec licence, attribution,
   constituants résolus et inférés, empreintes des entrées, `coverage.geojson`.
5. **Validation** : hold-out d'une journée contre la prévision BSH la plus
   fraîche, MARC ATLNE aux mêmes cellules, courant nul en base ; puis
   radar HF COSYNA (EMODnet ERDDAP, CC BY 4.0, 2019-01 à 2022-10, pas 20
   min, surface 0,3 à 2,5 m) analysé avec le même code sur 3 ans à 10
   points, ellipses M2 et S2 comparées à l'atlas BSH et à ATLNE.

## Atlas produits

| Atlas | Zone | Résolution | Enregistrement | Cellules | Tuiles | Taille | Temps de build |
|---|---|---|---|---|---|---|---|
| BSH_CUXBRU | Cuxhaven à Brunsbüttel | 90 m | 120 h (16 au 21/09) | 37 679 | 2 | 7,3 Mo | 4,8 s |
| BSH_AUSALT | Elbe extérieure à Altenbruch | 90 m | 120 h | 68 177 | 4 | 14 Mo | 5,9 s |
| BSH_IDB | baie allemande intérieure | 926 m | 72 h (19 au 21/09) | 5 719 | 8 | 1,4 Mo | 1,4 s |
| BSH_DB | baie allemande 6 à 9,5 E, 53 à 56,5 N | 926 m | 72 h | 59 637 | 43 | 11 Mo | 7,1 s |

Résolus à 72 à 120 h avec Rayleigh = 1 : **M2, K1, M4, M6**. Inférés :
S2, N2, O1, MS4, K2, P1, Q1, MN4, 2N2, MK4. La moyenne `z0_*` est celle de
la semaine (météo), marquée `mean_is_weather: true`, jamais appliquée au
runtime. Temps de build : le décodage GRIB domine ; l'analyse elle-même
prend moins d'une seconde par zone. Le registry actuel charge ces
répertoires sans modification.

## Résultats

### Hold-out : reconstruire une journée absente du fit

RMSE vectoriel en nœuds sur toutes les cellules et tous les instants de la
journée test ; skill = 1 − MSE / variance de la vérité. Vérité = prévision
BSH au délai indiqué.

| Zone | Fit | Test (délai) | Atlas BSH, tidal | Atlas BSH, + moyenne | MARC ATLNE | Courant nul | Biais de vitesse BSH / ATLNE |
|---|---|---|---|---|---|---|---|
| CuxBru 90 m | 72 h (16 au 18/09) | 19/09 (0 à 24 h) et 20/09 | **0,61 kt (skill 0,76)** | 0,55 (0,81) | 1,07 (0,26) | 1,24 | −0,18 / −0,51 kt |
| AusAlt 90 m | 72 h | 19 et 20/09 | **0,61 (0,68)** | 0,50 (0,79) | 0,88 (0,33) | 1,07 | −0,19 / −0,37 |
| idb 926 m | 48 h (19 au 20/09) | 21/09 (48 à 72 h) | **0,43 (0,66)** | 0,52 (0,50) | 0,60 (0,35) | 0,73 | −0,07 / −0,31 |
| db 926 m | 48 h | 21/09 (48 à 72 h) | 0,70 (0,18) | 0,88 (−0,27) | 0,72 (0,15) | 0,78 | −0,34 / −0,48 |

Aux points nommés, vitesse maximale sur la journée test (vérité / atlas
BSH / ATLNE) :

| Point | Vérité BSH | Atlas BSH | ATLNE |
|---|---|---|---|
| Rade de Cuxhaven (53,885 N 8,705 E), 90 m | **4,59 kt** à 09:30 (jusant vers 321°) | 3,53 kt | 0,92 kt |
| Medemgrund (53,905 N 8,88 E), 90 m | 1,61 kt à 09:30 | 1,11 kt | 1,32 kt |
| Approche de l'Elbe, Scharhörn (53,98 N 8,31 E) | 2,04 kt | 1,07 kt | 0,74 kt |
| Sud de Helgoland (54,146 N 7,896 E), 926 m | 1,27 kt | 0,87 kt | 0,45 kt |
| Milieu du passage (54,03 N 8,30 E), 926 m | 1,30 kt | 1,01 kt | 0,92 kt |
| Rade de Cuxhaven, 926 m | 2,25 kt | 1,69 kt | 0,65 kt |

Lecture : avec trois jours de fit, l'atlas BSH explique les deux tiers à
trois quarts de la variance de la prévision, ATLNE un quart à un tiers.
L'atlas sous-estime les pics de 20 à 25 % (le jusant de 4,6 kt à Cuxhaven
devient 3,5 kt) parce que la marée ne porte pas la part météo et parce
qu'un fit de 72 h sans S2 ni N2 résolus lisse les extrêmes. La zone `db`
à 48 h de fit et 48 à 72 h de délai est trop courte pour conclure ;
`idb`, même fit, tient (skill 0,66) : la différence vient des estrans et
de la côte danoise où le signal est météo, inclus dans `db`.

### Radar HF COSYNA : la seule référence indépendante des modèles

Ellipse M2 observée sur 2019 à 2022 (42 000 à 64 000 échantillons par
point, 54 à 68 % de couverture, variance expliquée 0,86 à 0,92 sur u) et
écarts de l'atlas BSH et d'ATLNE après alignement des axes : amplitude du
demi-grand axe en %, inclinaison en degrés, phase de Greenwich en degrés
(28,98° = 1 h pour M2, 30° pour S2).

| Point radar | M2 observé (kt / incl. / G) | Atlas BSH ΔA / Δincl / ΔG | ATLNE ΔA / Δincl / ΔG | S2 observé (kt) | BSH S2 ΔA / ΔG | ATLNE S2 ΔA / ΔG |
|---|---|---|---|---|---|---|
| Nord de Helgoland (54,26 N 7,88 E) | 1,00 / 170° / 59° | +23 % / −1° / +6° | −25 % / +18° / +28° | 0,26 | +19 % / +9° | −26 % / +24° |
| Sud-est de Helgoland (54,13 N 7,95 E) | 0,98 / 11° / 257° | +18 % / −12° / −5° | −31 % / −8° / +8° | 0,26 | +12 % / −5° | −34 % / +3° |
| Approche de l'Elbe (54,00 N 8,10 E) | 1,17 / 166° / 63° | **+19 % / −2° / 0°** | −39 % / +8° / +14° | 0,31 | +12 % / +3° | −42 % / +12° |
| Approche de l'Eider (54,10 N 8,60 E) | 1,89 / 148° / 70° | +15 % / +21° / +2° | −33 % / +23° / +37° | 0,52 | +6 % / +3° | −39 % / +35° |
| Milieu de baie (54,30 N 7,30 E) | 0,94 / 164° / 55° | **+6 % / −3° / −8°** | −21 % / −2° / +12° | 0,24 | +11 % / −10° | −19 % / +11° |
| Banc d'Amrum (54,50 N 8,20 E) | 1,21 / 7° / 265° | +7 % / −14° / −19° | −31 % / +13° / +16° | 0,31 | +11 % / −22° | −32 % / +15° |
| Port de Helgoland (54,18 N 7,90 E), point mal placé | 0,92 / 175° / 61° | −42 % / −38° / −50° | −17 % / −3° / +15° | 0,24 | −46 % / −46° | −21 % / +13° |

Trois points (embouchure de l'Elbe, Elbe extérieure, Norderney) sont hors
de la couverture radar (0 échantillon).

Lecture :

- Hors du point placé dans le port de Helgoland (sillage de l'île, non
  résolu à 926 m), **l'atlas BSH tombe à 0 à 19° de phase M2 des
  observations, soit moins de 40 minutes, et à 1 à 14° d'inclinaison**
  (21° à l'Eider, sur des bancs). **ATLNE retarde de 8 à 37°** (16 minutes à
  1 h 17) et sous-estime M2 de 21 à 39 %.
- L'atlas BSH donne M2 **plus fort que le radar de 6 à 23 %**, alors que le
  radar voit la couche 0,3 à 2,5 m et BSH la moyenne 0 à 5 m ; un fit de
  trois jours charge M2 de l'énergie des constituants non résolus, et
  l'archive d'un mois dira si ce biais tient. Sur S2 (inféré depuis le
  rapport ATLNE appliqué au M2 BSH), l'écart est du même ordre, ce qui
  valide le rapport S2/M2 d'ATLNE à ±10 %.
- Les phases ATLNE retardées de 12 à 16° au large et de 28 à 37° vers la
  côte recoupent le contrôle des hauteurs contre TICON-3 (Cuxhaven : +36°).

### Références publiées, pour situer les ordres de grandeur [recherche déléguée, pages lues le 2026-09-19]

- **BSH Bericht 27 (Klein & Mittelstaedt 2001)**, mesures à 12 mouillages
  autour de Helgoland, courant tidal pur (résiduel retiré), surface :
  position F (54°09,3' N 7°53,4' E) 1,81 kt au flot de vive-eau à HW−3 h,
  1,44 kt au jusant à HW+4 h ; morte-eau 1,24 / 1,05 kt ; flot au 105 à
  110°, jusant au 275 à 300°. Rapport morte-eau / vive-eau 76 % en surface.
  Le max de l'atlas BSH sur le 21/09 (régime de morte-eau tirant vers la
  marée moyenne) au sud de Helgoland, 0,87 à 1,27 kt selon la source,
  encadre le 1,24 kt mesuré en morte-eau.
- **WMS BSH « Gezeitenstrom Positionen »** (DL-DE-BY-2.0, sortie de modèle) :
  station 4 (53,98 N 8,44 E) 2,2 kt à HW−3 h et 2,0 kt à HW+3 h en
  vive-eau, 1,2 kt en morte-eau.
- **BAW 2006 (pièce H.1a)**, chenal de l'Elbe, moyenné sur la verticale,
  sans vent : pic de jusant 1,50 à 1,91 m/s (2,9 à 3,7 kt) à Cuxhaven,
  instantané jusqu'à 2,20 m/s (4,3 kt) ; flot 5,2 à 5,9 h, jusant 6,5 à
  7,3 h. La prévision BSH du 19/09 (4,59 kt de jusant en rade de Cuxhaven,
  couche 0 à 5 m) est dans le haut de cette fourchette.
- **WSV Beweissicherung 2011**, stations LZ hors chenal, capteur à 2,5 m
  du fond : max 1,40 m/s à Neufeld (LZ2), record 2,0 m/s en 1999. Étale de
  flot 74 à 103 min après PM à Cuxhaven selon la station : **il n'existe pas
  de valeur unique « étale = PM + X »**.
- Guides nautiques (blauwasser.de, forum Segeln, conférence BAW 2013) : 3 à
  4 kt à Cuxhaven, 4 à 5 kt au jusant à la Kugelbake.

## Limites

1. **Trois jours ne font pas un atlas.** S2, N2, K2 et les diurnaux
   secondaires viennent d'ATLNE par inférence ; la modulation vive-eau /
   morte-eau est donc celle d'ATLNE, dont le rapport S2/M2 est à peu près
   juste ici mais pas garanti dans l'estuaire. Il faut 15 jours pour S2,
   29 jours pour N2, 183 jours pour K2 et P1, un an pour SA et pour une
   moyenne climatologique. D'où le workflow d'archivage.
2. **Le produit est une prévision de surface avec la météo dedans.** Un fit
   court porte le vent de la semaine dans M2 et surtout dans la moyenne ;
   un an lisse cela. La couche 0 à 5 m est plus rapide qu'une moyenne
   verticale (MARC, BAW) et plus lente que la surface vraie (radar, dérive
   de Stokes absente, Callies et al. 2017).
3. **Pas d'estrans** : le masque est fixe, les cellules qui découvrent
   portent des valeurs de modèle sur un fond sec. Le runtime n'a pas de
   notion de hauteur d'eau minimale ; à traiter en aval si un jour on route
   dans le Wadden.
4. **Frontières** : AusAlt et CuxBru se touchent sans se recouvrir ; à la
   jonction (Altenbruch) les valeurs sautent. À fusionner en un atlas Elbe
   au prochain build.
5. **Inférence par zone, pas par cellule** : un seul jeu de rapports par
   atlas. Suffisant à 926 m au large, discutable à 90 m dans l'estuaire.
6. **Validation de phase indirecte** dans l'Elbe : le radar ne couvre pas
   le chenal. Le service SOS de la WSV (mesures 2014 à 2025 à
   l'Altenbrucher Bogen, DL-DE Zero 2.0) est la référence à exploiter à la
   prochaine itération ; sa référence de nord pour les directions n'est pas
   documentée.
7. **Aucun RMSE publié du modèle BSH** : les chiffres ci-dessus mesurent
   l'atlas contre le modèle et contre le radar, pas le modèle contre la
   vérité de terrain.

## Coût

| Étape | Temps | Volume |
|---|---|---|
| Archive de 3 jours, 8 zones | 4 min | 380 Mo (bz2) |
| Build des 4 atlas | 20 s | 34 Mo |
| Validation complète (4 hold-out, 10 points radar × 3 ans) | 3 min | rapport 40 ko |
| Téléchargement radar (10 points × 3,7 ans) | 6 min | 25 Mo |
| Archive d'un an, 8 zones (projection) | 3 min par jour de runner | 8 Go brut, 3 Go dédoublonné |
| Build d'un an, Elbe 90 m (projection : 35 000 instants × 38 000 cellules) | ≈ 20 min | idem |

## Ce qui n'est pas fait, volontairement

- Aucun câblage dans `router.py`, aucun envoi vers Hugging Face.
- Pas d'exploitation des mesures WSV ni des ADCP FINO (inscription BSH).
- Pas de test contre les tables imprimées du BSH (payantes).

## Publication du 2026-09-20

Les quatre atlas de ce spike (`BSH_DB`, `BSH_IDB`, `BSH_AUSALT`, `BSH_CUXBRU`)
sont dans le dataset que les Spaces lisent au build, avec `zone` et
`confidence` ajoutés aux métadonnées (libellés `bsh_db_926m`, `bsh_idb_926m`,
`bsh_ausalt_90m`, `bsh_cuxbru_90m`). Ils sont bâtis sur 3 à 5 jours de
prévisions : M2, K1, M4 et M6 résolus, S2 et N2 inférés d'ATLNE au centre du
domaine (section validation). Un atlas d'un mois d'archive les remplacera
sans changer le format ; c'est le critère de « done » de l'étape 1 de la
roadmap, et il demande d'activer `archive-bsh-currents.yml`.
