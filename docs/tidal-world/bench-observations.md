# Courants servis contre les observations : radars HF et courantomètres

Banc du 2026-10-11, branche `bench/hf-radar-validation`, script
[`scripts/bench_observations.py`](../../scripts/bench_observations.py)
(`download`, `extract`, `analyse`). Résultats bruts :
`build/hf_radar/results.json` (non suivi).

Jusqu'ici tout se comparait de modèle à modèle : le banc `bench-global.md`
mesurait chaque atlas contre le modèle régional dont il est tiré, ce qui
l'avantage par construction. Ici la référence est une **mesure** : radars HF
de surface et courantomètres amarrés, heure par heure.

Chaque affirmation porte **[vérifié]** (un chiffre de ce banc ou une lecture
directe d'une source) ou **[supposé]**.

Candidats, tous en nœuds :

- **A** : SMOC total (`utotal`, `vtotal`), ce qu'Open-Meteo sert hors atlas ;
- **S** : la cascade servie, reconstruite avec les registres et les règles du
  dépôt (zone inconnue, SHOM C2D à 0,5 km, `MarcAtlasRegistry.covers` avec la
  politique de service, eau morte, passe aveugle), A ailleurs ;
- **F** : SMOC sans dérive de Stokes (`utide + uo`, `vtide + vo`) ;
- **D** : hybride, marée de S (SHOM ou atlas) plus circulation SMOC (`uo`,
  `vo`), F là où S retombe sur SMOC ;
- **0** : pas de courant.

## Réponse courte

**1. La cascade servie (S) bat-elle SMOC total (A) ?** Oui là où la marée
est forte et la côte découpée, non ailleurs.

- Mer d'Iroise, le seul site français à radar : erreur vectorielle
  quadratique 0,734 kt contre 0,834 (-12 %), erreur le long de la route
  0,516 contre 0,600 (-14 %) [vérifié]. Le gain vient des cellules près des
  îles : dans la cartouche SHOM d'Ouessant, 0,94 kt contre 1,42, et SMOC y
  fait pire que l'absence de courant (1,14) [vérifié]. Sur FINIS 250 m,
  0,75 contre 0,81 [vérifié].
- Au large de l'Iroise, là où MANGA 700 m répond (marée de vives-eaux de
  1,8 kt), l'atlas fait **pire** que SMOC : 0,42 contre 0,35 (+20 %), avec
  un biais de vitesse de -0,13 kt [vérifié].
- Baie allemande (atlas BSH 926 m) : 0,431 contre 0,403 (+7 %) [vérifié].
  L'atlas BSH donne une ellipse M2 24 % plus forte que le radar, la marée
  FES2014 de SMOC 2 % plus faible [vérifié].
- Côte basque (AQUI 250 m, Copernicus IBI) : 0,507 contre 0,486 (+4 %), et
  SMOC n'y fait pas mieux que l'absence de courant (0,486 dans les deux cas)
  [vérifié]. La marée y est faible (M2 observée de 0,07 à 0,08 kt), le
  courant vient du vent et de la circulation.
- Courantomètres du golfe de Gascogne : 0,480 contre 0,476, égalité
  [vérifié].

**2. L'hybride (D) fait-il mieux ?** Oui, partout ou presque, mais le vrai
gain sur A vient de la suppression de la dérive de Stokes.

- D contre S : -1,5 % en Iroise (0,723), -8 % en baie allemande (0,398),
  -2 % au Pays basque (0,495), -9 % sur les courantomètres (0,435)
  [vérifié]. Le -10 % du banc modèle contre modèle se retrouve, plus
  modeste là où la marée domine.
- F (SMOC sans Stokes) bat A sur chacun des cinq sites, de -1 % à -11 %
  [vérifié], alors même que le radar mesure le premier mètre, où une part
  de la dérive de Stokes existe.
- Hors Iroise, F fait aussi bien ou mieux que D : 0,393 contre 0,398 en baie
  allemande, 0,468 contre 0,495 au Pays basque, 0,424 contre 0,435 sur les
  courantomètres [vérifié].
- Une règle simple tient sur tous les sites : **D là où la marée servie
  atteint 0,75 kt en vives-eaux, F ailleurs**. Iroise 0,725, baie allemande
  0,398, Pays basque 0,472, courantomètres 0,426 [vérifié] ; soit -1 % à
  -11 % contre la cascade d'aujourd'hui sur chaque site, et -1 % à -13 %
  contre SMOC total. Seuil choisi sur ces mêmes données : à confirmer sur
  d'autres mois et d'autres côtes [supposé].

**3. En eau profonde, qui a raison, Copernicus (0,2 à 0,33 kt) ou les
modèles 2D (environ 0,1 kt) ?** Ni l'un ni l'autre : la mesure tombe entre
les deux, et sous le seuil de 0,2 kt.

- Aucun courantomètre ni radar en eau profonde au nord de 46° N, là où
  répond NWS : NWS lui-même n'est pas testé [vérifié, recherche décrite plus
  bas].
- Au sud-est du golfe (radar basque, profondeur de plus de 1 000 m,
  222 cellules), l'ellipse M2 observée vaut 0,075 kt en médiane. Copernicus
  IBI en donne 1,5 fois plus (0,110), l'atlas Copernicus MED 1,9 fois
  (0,134). ATLNE, MANGA et la marée FES2014 de SMOC en donnent la moitié
  (0,035) [vérifié].
- Sur les bouées profondes de Puertos del Estado (250 à 1 250 m), IBI et MED
  donnent 2,1 à 2,5 fois la M2 mesurée, ATLNE 0,3 à 0,8 fois [vérifié].
- Lecture : les atlas Copernicus 3D gonflent la marée de surface en eau
  profonde, probablement par la marée interne qu'ils contiennent mais pas en
  phase avec la mesure [supposé]. Les modèles 2D la sous-estiment de moitié
  [vérifié]. Par analogie, les 0,2 à 0,33 kt de NWS sur le talus sont
  probablement trop forts [supposé].
- Conséquence pour la cascade : la marée mesurée (M2 de 0,07 kt, donc
  environ 0,1 kt en vives-eaux [supposé]) reste sous 0,2 kt, et SMOC
  devrait répondre. Pourtant IBI et MED franchissent le seuil grâce à leur
  marée gonflée, et S sert alors 1,7 fois la M2 observée au-delà de 1 000 m
  [vérifié]. Sur l'erreur totale, l'effet reste faible : en eau profonde,
  aucun candidat ne bat l'absence de courant (0,52 à 0,54 kt) [vérifié].

**Trois constats en plus.**

- **Copernicus MED répond dans le golfe de Gascogne.** Sa bbox (33,1 à
  45,7° N, 6,5° W à 27,3° E) couvre le coin sud-est du golfe. Là où MANGA,
  ATLNE et IBI déclinent pour marée faible, MED répond : 52 cellules du radar
  basque et la bouée du cap Peñas. Sa M2 y vaut 1,7 à 3,1 fois celle du
  radar selon la profondeur [vérifié]. C'est un défaut de la cascade, pas un
  choix. Le golfe de Cadix, lui aussi dans cette bbox, n'est pas testé
  [supposé].
- **L'exclusion de Gibraltar est confirmée par la mesure.** Sur les
  378 cellules radar du détroit dans la boîte d'exclusion, SMOC fait
  1,29 kt d'erreur, la marée IBI seule ferait 1,73, autant que l'absence de
  courant (1,77) [vérifié]. Juste à l'est de la boîte (5,2 à 5,0° W, vers
  Gibraltar et Ceuta), où IBI répond (135 cellules), aucun candidat n'a
  d'habileté : de 1,66 à 1,70 kt contre 1,66 sans courant [vérifié].
- **La règle de marée faible tient, sur peu de points.** Sur les
  17 cellules basques où MANGA décline, sa marée ferait 0,66 kt d'erreur
  contre 0,58 pour SMOC [vérifié].

## Décisions pour le mainteneur

1. Confiner Copernicus MED à la Méditerranée, par exemple une boîte exclue
   au nord de 42° N et à l'ouest de 0° (le golfe de Gascogne) dans
   `serving_policy.py`, et regarder le golfe de Cadix. Le chiffre plaide
   pour, la forme est à choisir.
2. Passer à SMOC sans Stokes (F) hors atlas, et à l'hybride (D) là où la
   marée servie dépasse un seuil (0,75 kt sur ces données). Cela demande
   SMOC en composantes, donc un accès Copernicus et un cache serveur
   (feuille de route, point 3).
3. En eau profonde, ne plus juger la marée faible sur l'atlas Copernicus
   lui-même, qui la gonfle : par exemple juger sur ATLNE ou FES2014, ou ne
   pas servir les atlas Copernicus au-delà de 200 m de fond.
4. L'atlas BSH 926 m en baie allemande et MANGA au large de l'Iroise font
   moins bien que SMOC contre le radar. L'hybride les ramène au niveau de
   SMOC : MANGA 0,36 contre 0,35, BSH 0,38 contre 0,39 [vérifié]. Sans
   hybride, garder l'état actuel ou les retirer se discute.
5. La passe de Tarifa (7 cellules, courant retiré par la règle des passes
   aveugles) : SMOC y aurait fait 1,12 kt d'erreur contre 1,77 sans courant
   [vérifié]. Retirer reste défendable pour un chenal de 1 à 3 kt, mais la
   valeur retirée n'était pas inutile.

## Méthode

- **Heure par heure.** Les mesures sont moyennées vectoriellement dans une
  fenêtre de ±30 min autour de chaque heure ronde ; SMOC est instantané à
  l'heure. Décalage optimal vérifié : S au plus près à 0 h en Iroise et en
  baie allemande (une heure de décalage dégrade S de 15 et 36 %) ; ailleurs
  un décalage d'une heure change moins de 0,5 % [vérifié].
- **Contrôle qualité.** Iroise : `flag == 1` et au moins 3 des 6 mesures
  de l'heure. Nœud européen (ERDDAP) : `QCflag == 1` (test de vitesse, GDOP,
  au moins 3 radiales, variance), au moins 2 mesures sur 3 par heure en baie
  allemande. Courantomètres : drapeaux 0, 1 ou 2 et vitesse sous 3 m/s
  (Oléron ne livre que des données non contrôlées, drapeau 0) [vérifié].
- **Cellules.** Une cellule radar entre dans le banc si elle a des données
  valides au moins 30 % des heures ; en Iroise une cellule sur deux dans
  chaque direction (1,5 km de maille), en baie allemande et à Gibraltar le
  téléchargement saute déjà une ligne sur deux.
- **SMOC.** La cellule qui contient le point si elle est mouillée, sinon la
  cellule mouillée la plus proche à moins de 10 km. Proche de ce que fait
  Open-Meteo près des côtes [supposé].
- **Cascade.** Ordre de `CompositeMarineAdapter.fetch` : zone inconnue
  (`unknown_zone_at`), SHOM si `shom.covers`, sinon `marc.covers` (rang,
  maille, marée faible à 0,2 kt pour les rangs 0 et 1, Gibraltar exclu),
  eau morte d'un atlas côtier, sinon SMOC. Plus la règle du moteur : à moins
  de 3 km d'une passe que la source ne voit pas, courant inconnu. Les points
  inconnus sortent des métriques de S et sont comptés.
- **Métriques**, sur l'échantillon commun aux candidats A, S, F, D :
  erreur vectorielle quadratique ; erreur le long de la route (erreur
  projetée sur un cap tiré au hasard, fixe par point, graine 20261011),
  métrique principale du banc précédent ; biais de vitesse ; erreur de
  direction quand l'observé dépasse 0,5 kt.
- **Ellipse M2.** Moindres carrés sur M2, S2, N2, K1, O1, M4 pour la mesure
  et pour la marée de SMOC (`utide`, `vtide`) ; constantes M2 lues
  directement dans chaque atlas qui a une cellule au point, servi ou non.
- **Profondeur.** Bathymétrie du modèle global Copernicus au 1/12°
  (`deptho`), grossière près des côtes [vérifié pour la source, supposé pour
  la précision locale].

**Réserve sur le radar.** Un radar HF mesure le courant du premier mètre
environ (de 0,5 à 2,5 m selon la fréquence) [supposé] : il voit la dérive
due au vent et une partie de la dérive de Stokes. Les atlas donnent une
marée moyennée sur la verticale (MARC, SHOM) ou de surface (Copernicus,
BSH). La mesure favorise donc les candidats qui portent une circulation
(A, F, D) contre la marée seule (S). C'est aussi ce qu'un voilier subit, à
quelques décimètres près [supposé]. Les deux mois d'Iroise et de baie
allemande sont des mois d'hiver venteux [supposé].

## Données

Volume total téléchargé : 567 Mo sous `build/hf_radar/` [vérifié].

| Site | Source et identifiant | Période | Cellules utilisées / avec données | Heures valides | Volume |
|---|---|---|---|---|---|
| Iroise (radars WERA de Garchine et Brézellec) | Shom, « Courants de surface - Radar HF », API d'archive `https://services.data.shom.fr/oceano/archive/download?date=AAAAMMJJ&model=RADARHF_OBS_R1110_IROISE&mail=…`, Licence Ouverte 2.0, DOI 10.17183/RADARHF_OBS | 2020-12-01 au 2021-01-31 | 321 / 576 | 69 % | 55 Mo (62 fichiers quotidiens) |
| Baie allemande (COSYNA, Hereon) | EMODnet Physics ERDDAP `EUHFR_NRTcurrent_HFR-COSYNA-Total` | 2020-12 et 2021-01 | 439 / 643 | 48 % | 139 Mo |
| Pays basque (EUSKOOS, AZTI) | EMODnet Physics ERDDAP `EUHFR_NRTcurrent_HFR-EUSKOOS-Total` | 2026-01 et 2026-07 (données jusqu'au 16 juillet) | 603 / 781 | 43 % | 14 Mo |
| Gibraltar (Puertos del Estado) | EMODnet Physics ERDDAP `EUHFR_NRTcurrent_HFR-Gibraltar-Total` | 2026-01 et 2026-07 | 520 / 588 | 57 % | 17 Mo |
| Courantomètres (environ 3 m de profondeur) | Copernicus In Situ TAC `INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033`, jeu `cmems_obs-ins_ibi_phybgcwav_mynrt_na_irr`, partie `monthly` : Oléron large `GL_TS_MO_6200080` (janvier seulement), Bilbao-Vizcaya `IR_TS_MO_6200024`, cap Peñas `6200025`, Estaca de Bares `6200082` (fond de 1 800 m d'après le fichier), Villano-Sisargas `6200083` (juillet seulement) | 2026-01 et 2026-07 | 5 / 5 | 80 % | 2 Mo |
| SMOC en composantes | `cmems_mod_glo_phy_anfc_merged-uv_PT1H-i` (`utotal`, `vtotal`, `utide`, `vtide`, `uo`, `vo`), petites boîtes téléchargées pour 2020-12 et 2021-01, découpées dans `build/bench_global/smoc_atl_2026-0{1,7}.nc` pour 2026 | idem | | | 212 Mo |
| Bathymétrie | `cmems_mod_glo_phy_anfc_0.083deg_static`, `deptho` | | | | 0,8 Mo |

Pourquoi deux périodes : le radar d'Iroise s'arrête le 2021-01-31 et SMOC
commence le 2020-11-01 ; le nœud européen n'a pas de données COSYNA de
juillet 2022 à août 2026 [vérifié]. Iroise et baie allemande partagent donc
décembre 2020 et janvier 2021, les autres sites janvier et juillet 2026.

**Ce qui a été cherché sans succès.**

- **Radar du Pas de Calais (ULCO, LOG).** Absent du produit Copernicus
  `INSITU_GLO_PHY_UV_DISCRETE_NRT_013_048` (jeu
  `cmems_obs-ins_glo_phy-cur_nrt_radar-total_irr`, parties `latest`,
  `monthly` et `history`) et du produit multi-années
  `INSITU_GLO_PHY_UV_DISCRETE_MY_013_044`
  (`cmems_obs-ins_glo_phy-cur_my_radar-total_irr`). Absent du catalogue
  THREDDS du nœud européen (`thredds.hfrnode.eu`) et d'EMODnet Physics
  ERDDAP. Pas d'archive publique trouvée par recherche web : les campagnes
  publiées (1990-1991, 2003, 2018) sont sur demande [vérifié].
- **Radar d'Iroise** : absent des mêmes catalogues européens, trouvé
  seulement par l'API d'archive du Shom, documentée sur la fiche produit de
  `diffusion.shom.fr` [vérifié].
- **Courant en eau profonde au nord de 46° N (question 3, NWS).** Le jeu
  ADCP multi-années `cmems_obs-ins_glo_phy-cur_my_adcp_irr` compte
  48 plateformes, aucune dans le golfe de Gascogne. L'index de
  `cmems_obs-ins_ibi_phybgcwav_mynrt_na_irr` ne liste, au nord de 46° N et
  avec du courant, que des bouées dérivantes de quelques jours et des
  mouillages côtiers [vérifié]. D'où le report sur le sud-est du golfe.

## Résultats par site

Chaque case : erreur vectorielle quadratique / erreur le long de la route,
en nœuds. Biais et direction sur l'ensemble du site.

### Iroise

329 538 couples heure-cellule, vitesse observée moyenne 0,93 kt,
95e centile 1,97 kt [vérifié].

| Périmètre | Cellules | A | S | F | D | 0 |
|---|---|---|---|---|---|---|
| Tout | 321 | 0,834 / 0,600 | 0,734 / 0,516 | 0,820 / 0,590 | 0,723 / 0,508 | 1,085 / 0,769 |
| `marc_finis_250m` | 221 | 0,81 / 0,58 | 0,75 / 0,53 | 0,80 / 0,57 | 0,74 / 0,52 | 1,07 / 0,75 |
| `marc_manga_700m` | 62 | 0,35 / 0,25 | 0,42 / 0,29 | 0,38 / 0,28 | 0,36 / 0,26 | 1,06 / 0,77 |
| `marc_atlne_2000m` | 6 | 0,33 / 0,22 | 0,37 / 0,26 | 0,38 / 0,25 | 0,33 / 0,23 | 1,02 / 0,66 |
| `shom_c2d_560_ouessant` | 24 | 1,42 / 1,04 | 0,94 / 0,66 | 1,39 / 1,02 | 0,95 / 0,66 | 1,14 / 0,82 |
| `shom_c2d_560_iroise` | 7 | 0,86 / 0,60 | 1,08 / 0,76 | 0,86 / 0,60 | 1,05 / 0,74 | 1,55 / 1,07 |
| `shom_c2d_564_manche` | 1 | 0,34 / 0,29 | 0,34 / 0,26 | 0,37 / 0,33 | 0,30 / 0,22 | 0,92 / 0,84 |

Biais de vitesse : A +0,11, S -0,01, F +0,05, D +0,01, 0 -0,93 kt.
Direction (observé > 0,5 kt) : 27°, 27°, 27°, 25°, 85° [vérifié].

### Baie allemande (COSYNA)

311 775 couples, 0,74 kt en moyenne, 95e centile 1,32 kt [vérifié].

| Périmètre | Cellules | A | S | F | D | 0 |
|---|---|---|---|---|---|---|
| Tout | 439 | 0,403 / 0,281 | 0,431 / 0,301 | 0,393 / 0,274 | 0,398 / 0,277 | 0,810 / 0,562 |
| `bsh_db_926m` | 433 | 0,39 / 0,28 | 0,42 / 0,29 | 0,38 / 0,27 | 0,38 / 0,27 | 0,81 / 0,56 |
| `bsh_ausalt_90m` | 6 | 0,93 / 0,56 | 1,06 / 0,75 | 0,92 / 0,54 | 1,05 / 0,75 | 1,12 / 0,80 |

Biais : A +0,02, S +0,11, F -0,02, D +0,13, 0 -0,74 kt. Direction : 15°,
17°, 14°, 12°, 76° [vérifié].

### Pays basque (EUSKOOS)

389 038 couples, 0,41 kt en moyenne, 95e centile 0,90 kt [vérifié].

| Périmètre | Cellules | A | S | F | D | 0 |
|---|---|---|---|---|---|---|
| Tout | 603 | 0,486 / 0,343 | 0,507 / 0,357 | 0,468 / 0,330 | 0,495 / 0,350 | 0,486 / 0,343 |
| `cmems_ibi_3000m` | 287 | 0,52 / 0,37 | 0,51 / 0,36 | 0,50 / 0,36 | 0,51 / 0,36 | 0,51 / 0,36 |
| `marc_aqui_250m` | 245 | 0,44 / 0,31 | 0,49 / 0,35 | 0,42 / 0,29 | 0,47 / 0,33 | 0,44 / 0,31 |
| `cmems_med_4200m` | 52 | 0,48 / 0,35 | 0,52 / 0,37 | 0,47 / 0,33 | 0,50 / 0,35 | 0,49 / 0,36 |
| `openmeteo_smoc` | 17 | 0,58 / 0,36 | 0,58 / 0,36 | 0,58 / 0,37 | 0,58 / 0,37 | 0,65 / 0,44 |
| `marc_atlne_2000m` | 2 | 0,26 / 0,21 | 0,43 / 0,34 | 0,28 / 0,22 | 0,32 / 0,24 | 0,40 / 0,32 |

Biais : A -0,02, S -0,24, F -0,13, D -0,09, 0 -0,41 kt. Direction : 53°,
81°, 57°, 59°, 86° [vérifié].

### Gibraltar

438 202 couples, 1,47 kt en moyenne, 95e centile 3,25 kt ; 7 cellules de
la passe de Tarifa en courant inconnu, hors métriques de S [vérifié].

| Périmètre | Cellules | A | S | F | D | 0 |
|---|---|---|---|---|---|---|
| Tout | 513 | 1,397 / 0,984 | 1,387 / 0,970 | 1,386 / 0,977 | 1,387 / 0,978 | 1,747 / 1,237 |
| `openmeteo_smoc` (boîte exclue) | 378 | 1,29 / 0,90 | 1,29 / 0,90 | 1,29 / 0,90 | 1,29 / 0,90 | 1,77 / 1,26 |
| `cmems_ibi_3000m` | 135 | 1,70 / 1,21 | 1,66 / 1,16 | 1,66 / 1,18 | 1,67 / 1,19 | 1,66 / 1,16 |

Dans la boîte exclue, la marée IBI aurait fait 1,73 / 1,23, et IBI plus
la circulation SMOC 1,28 / 0,90 [vérifié].

### Courantomètres du golfe de Gascogne

5 944 couples sur cinq bouées, 0,41 kt en moyenne [vérifié].

| Bouée (source servie, fond du modèle global) | A | S | F | D | 0 |
|---|---|---|---|---|---|
| Oléron large (`marc_aqui_250m`, 56 m) | 0,25 / 0,18 | 0,31 / 0,24 | 0,23 / 0,14 | 0,25 / 0,18 | 0,40 / 0,31 |
| Bilbao-Vizcaya (`cmems_ibi_3000m`, 1 245 m) | 0,58 / 0,40 | 0,62 / 0,39 | 0,54 / 0,39 | 0,55 / 0,39 | 0,61 / 0,39 |
| Cap Peñas (`cmems_med_4200m`, 763 m) | 0,47 / 0,35 | 0,43 / 0,30 | 0,35 / 0,25 | 0,39 / 0,28 | 0,40 / 0,28 |
| Estaca de Bares (`cmems_ibi_3000m`, 266 m) | 0,46 / 0,26 | 0,40 / 0,26 | 0,40 / 0,27 | 0,41 / 0,28 | 0,38 / 0,24 |
| Villano-Sisargas (`marc_atlne_2000m`, 454 m) | 0,49 / 0,34 | 0,55 / 0,37 | 0,48 / 0,33 | 0,47 / 0,31 | 0,56 / 0,38 |
| Toutes | 0,476 / 0,325 | 0,480 / 0,319 | 0,424 / 0,295 | 0,435 / 0,305 | 0,479 / 0,318 |

### Règles de service candidates

Erreur vectorielle quadratique, en nœuds : D là où la marée servie atteint
le seuil en vives-eaux, F ailleurs [vérifié].

| Règle | Iroise | Baie allemande | Pays basque | Courantomètres |
|---|---|---|---|---|
| Aujourd'hui (S) | 0,734 | 0,431 | 0,507 | 0,480 |
| A partout | 0,834 | 0,403 | 0,486 | 0,476 |
| D si marée ≥ 0,2 kt | 0,723 | 0,398 | 0,495 | 0,435 |
| D si marée ≥ 0,5 kt | 0,723 | 0,398 | 0,485 | 0,426 |
| D si marée ≥ 0,75 kt | 0,725 | 0,398 | 0,472 | 0,426 |
| D si marée ≥ 1 kt | 0,741 | 0,397 | 0,468 | 0,424 |
| D pour SHOM et atlas côtiers seulement | 0,725 | 0,396 | 0,488 | 0,426 |

## Question 3 : la marée en eau profonde

Demi-grand axe de l'ellipse M2, médiane par tranche de profondeur, radar
basque ; entre parenthèses, médiane du rapport à l'observé [vérifié].

| Fond | Cellules | Radar | Servie | Copernicus IBI | Copernicus MED | ATLNE | MANGA | SMOC (FES2014) |
|---|---|---|---|---|---|---|---|---|
| 0 à 50 m | 33 | 0,072 | 0,140 (1,95) | 0,125 (1,73) | 0,126 (1,79) | 0,066 (0,98) | 0,065 (1,00) | 0,058 (0,89) |
| 50 à 200 m | 185 | 0,084 | 0,159 (1,81) | 0,129 (1,63) | 0,142 (1,68) | 0,100 (1,11) | 0,102 (1,16) | 0,100 (1,14) |
| 200 à 1 000 m | 134 | 0,066 | 0,132 (2,00) | 0,125 (1,96) | 0,182 (3,08) | 0,039 (0,69) | 0,041 (0,71) | 0,041 (0,70) |
| plus de 1 000 m | 222 | 0,075 | 0,116 (1,67) | 0,110 (1,50) | 0,134 (1,86) | 0,035 (0,48) | 0,036 (0,48) | 0,035 (0,46) |

MARC AQUI 250 m, servi près de la côte basque, donne aussi 1,9 à 2 fois la
M2 observée sur le plateau [vérifié].

Bouées profondes (M2 en nœuds) [vérifié] :

| Bouée | Fond (modèle global) | Mesurée | Copernicus | ATLNE | SMOC (FES2014) |
|---|---|---|---|---|---|
| Bilbao-Vizcaya | 1 245 m | 0,046 | IBI 0,095 | 0,035 | 0,031 |
| Cap Peñas | 763 m | 0,074 | MED 0,162 | 0,019 | 0,039 |
| Estaca de Bares | 266 m (1 800 m d'après la bouée) | 0,073 | IBI 0,158 | 0,054 | 0,089 |
| Villano-Sisargas | 454 m | 0,182 | IBI 0,448 | 0,127 | 0,141 |

Pour comparaison, sur le plateau d'Iroise (50 à 200 m, 293 cellules) toutes
les sources tombent à ±10 % de la M2 du radar (1,18 kt) : NWS 1,03, FINIS
1,09, MANGA et ATLNE 0,97, FES2014 0,98 [vérifié]. En baie allemande,
FES2014 0,98, NWS 1,12, BSH 926 m 1,24, ATLNE 0,83 [vérifié].

## Limites

- **Peu de côte française.** Un seul site français (Iroise, deux mois
  d'hiver 2020-2021) et une bouée (Oléron, un mois, données non
  contrôlées). Rien en Manche orientale ni en Méditerranée française
  [vérifié]. Le Pas de Calais reste à obtenir auprès du LOG.
- **SMOC de 2020.** Les mois d'Iroise et de baie allemande lisent l'archive
  SMOC de l'époque ; Open-Meteo sert la version courante, peut-être
  meilleure [supposé].
- **Radar de surface contre atlas moyennés.** Voir la réserve plus haut :
  le banc mesure ce que le bateau subit, pas la seule marée.
- **Seuils réglés sur les données.** La règle « D si marée ≥ 0,75 kt »
  est choisie sur ces quatre régions ; aucune validation croisée [vérifié].
- **Échantillon dépendant.** Les cellules voisines d'un radar sont
  fortement corrélées : 300 000 couples ne valent pas 300 000 mesures
  indépendantes, et les écarts de 1 à 2 % sont dans le bruit [supposé].
- **Profondeur grossière.** La bathymétrie du modèle global au 1/12° classe
  mal les cellules près du talus (Estaca de Bares : 266 m au modèle,
  1 800 m d'après la bouée) [vérifié].
- **Pas de NWS en eau profonde.** La question 3 est tranchée pour IBI et
  MED, pas pour NWS [vérifié].

## Reproduire

Depuis `packages/data-adapters` :

```
env -u VIRTUAL_ENV PATH="/usr/bin:/bin:$HOME/.local/bin" uv sync -q --extra dev --frozen
env -u VIRTUAL_ENV PATH="/usr/bin:/bin:$HOME/.local/bin" uv run --with copernicusmarine \
    --with xarray --with netcdf4 --with scipy python ../../scripts/bench_observations.py download
# puis extract, puis analyse --m2
```

Identifiants Copernicus lus dans le `.env` du dépôt principal, jamais
affichés. `OPENWIND_ATLAS_DIR` désigne un dossier contenant les atlas servis
(un lien par atlas plus les fichiers SHOM C2D et le masque de terre).
Téléchargement 2 min, extraction 30 s, analyse 3 min.
