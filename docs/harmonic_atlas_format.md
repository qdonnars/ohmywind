# Format d'atlas harmonique, agnostique de la source

Version de schéma : **3**. Généralise `docs/marc_atlas_format.md` (reconnaissance
MARC, schéma 2) en un format que le runtime lit sans savoir d'où viennent les
constantes. Un atlas = un répertoire ; N builders hors ligne (un par source)
écrivent ce répertoire ; un seul registry le lit.

Ce document décrit le format cible et, en fin, ce qui change par rapport aux
atlas MARC déjà construits (réponse courte : les tuiles sont conformes, seul
`metadata.json` doit être complété, pas de rebuild).

## 1. Principes

- **Le runtime ne connaît que le format.** Aucune logique « si MARC alors »,
  « si BSH alors » : tout ce qui distingue une source est dans `metadata.json`.
- **Une cellule, une ligne.** Les constantes de hauteur (h) et de courant (u, v)
  d'un point sont sur la même ligne Parquet, en format large.
- **Convention unique de prédiction**, celle de
  `openwind_data/currents/harmonic.py` : phase Greenwich en degrés, temps UTC,
  corrections nodales Schureman, longitudes astronomiques Cartwright 1985.
  Un builder qui part de séries temporelles utilise
  `openwind_data/currents/harmonic_analysis.py`, qui partage ce code, ce qui
  rend l'aller-retour analyse → prédiction exact par construction (testé).
- **Direction « going to »** : le runtime calcule
  `atan2(u, v)` en degrés compas, 0° = courant portant au nord, comme le reste
  du code. Le format stocke u (est, m/s) et v (nord, m/s), jamais une direction.
- **Nœuds au runtime, SI dans l'atlas** : amplitudes en m (h) et m/s (u, v),
  conversion en nœuds dans le registry (`_MS_TO_KN`).

## 2. Arborescence

```
<ATLAS_ID>/
  metadata.json
  coverage.geojson
  tile_lat=<y>/tile_lon=<x>/data.parquet     # une tuile de 0,5° par fichier
```

- `ATLAS_ID` : majuscules, `<SOURCE>_<ZONE>` pour les nouveaux atlas
  (`BSH_CUXBRU`, `CMEMS_NWS_GERMAN_BIGHT`). Les MARC gardent leur nom court
  historique (`FINIS`, `ATLNE`), le champ `source.short` lève l'ambiguïté.
- Tuiles : origine sud-ouest `floor(lat / 0.5) * 0.5`, nom formaté `%.1f`
  (`tile_lat=53.5/tile_lon=8.5`). Une tuile est fermée au sud et à l'ouest,
  ouverte au nord et à l'est ; le runtime traite les coutures comme
  appartenant aux deux voisines (recherche `neighbours=True` de
  `_best_cell`). Une tuile sans cellule valide n'est pas écrite.
- Un atlas tient dans un seul répertoire du HF Dataset ; la présence de
  `metadata.json` suffit au registry pour le découvrir (`_scan_atlas`).

## 3. Schéma Parquet d'une tuile

| Colonne | Type | Obligatoire | Sens |
|---|---|---|---|
| `lat`, `lon` | float64 | oui | centre de cellule, WGS84, degrés décimaux, lon dans ]-180, 180] |
| `{C}_h_amp`, `{C}_h_g` | float32 | si hauteurs | amplitude (m) et phase Greenwich (°, [0, 360)) du constituant C pour la hauteur |
| `{C}_u_amp`, `{C}_u_g` | float32 | si courants | idem pour la composante est (m/s) |
| `{C}_v_amp`, `{C}_v_g` | float32 | si courants | idem pour la composante nord (m/s) |
| `z0_hydro_m` | float32 | non | décalage MSL → zéro hydrographique local (négatif) ; absent = pas de conversion possible |
| `z0_u_ms`, `z0_v_ms` | float32 | non | résiduel moyen (non tidal) sur la période d'analyse ; **jamais** utilisé par le runtime |
| `rmse_u_ms`, `rmse_v_ms`, `rmse_h_m` | float32 | non | résidu de l'analyse harmonique par cellule (diagnostic) |
| `n_samples` | int32 | non | échantillons ayant servi à l'analyse (diagnostic) |
| `depth_m` | float32 | non | profondeur de la cellule si la source la donne |

Règles :

- `{C}` est un **nom canonique NOC-60** (`M2`, `S2`, `N2`, `K1`, `O1`, `M4`,
  `MS4`, `K2`, `P1`, `Q1`, `MN4`, `M6`, `2N2`, `NU2`, `MU2`, `L2`, `2MS6`,
  `MK4`, `MF`, `MM`, `MSF`, `SA`, `SSA`, …, liste complète dans
  `harmonic.NAMES`). Les graphies MARC (`Mf`, `Mu2`, `La2`, `Ki1`…) restent
  acceptées en lecture via `harmonic.ALIASES` ; un nouveau builder écrit les
  noms canoniques. Un constituant inconnu du prédicteur est ignoré au
  runtime, sans erreur.
- Un couple `(amp, g)` incomplet ou NaN sur une cellule = constituant absent
  sur cette cellule (cas des faces U ou V sur terre d'une grille C).
- Les colonnes de la forme `Z0_u_amp` / `Z0_v_amp` (héritage MARC) sont
  tolérées et ignorées : le résiduel moyen va dans `z0_u_ms` / `z0_v_ms`.
- Pas de doublon `(lat, lon)` dans un atlas. Les cellules sont celles de la
  grille native quand elle est régulière (`grid.origin = "native"`), ou
  d'une grille régulière produite hors ligne sinon (`"regrid"`, cas MARC).

## 4. `metadata.json`

Exemple complet, tel qu'écrit par `scripts/build_bsh_atlas.py` :

```json
{
  "format": "ohmywind-harmonic-atlas",
  "schema_version": 3,
  "atlas": "BSH_CUXBRU",
  "zone": "cuxbru",
  "label": "Cuxhaven bis Brunsbuettel",
  "rank": 3,
  "resolution_m": 90,
  "effective_resolution_m": 90,
  "grid": {"type": "regular_ll", "dlat_deg": 0.000833, "dlon_deg": 0.001389, "origin": "native"},
  "source": {
    "short": "bsh",
    "name": "BSH Stroemungsvorhersagen (operational surface-current forecast)",
    "provider": "Bundesamt fuer Seeschifffahrt und Hydrographie",
    "url": "ftp://ftp.bsh.de/Stroemungsvorhersagen/",
    "product": "Current_CuxBru",
    "version": null,
    "licence": {
      "name": "CC BY 4.0",
      "url": "https://creativecommons.org/licenses/by/4.0/",
      "read_at": "2026-09-19",
      "evidence": "ftp://ftp.bsh.de/Stroemungsvorhersagen/LICENSE.txt"
    },
    "attribution": "Data provided by Bundesamt fuer Seeschifffahrt und Hydrographie (BSH), CC BY 4.0. Harmonic constants derived by OhMyWind.",
    "citation": null,
    "redistribution_of_derivative": "allowed with attribution"
  },
  "variables": ["u", "v"],
  "vertical": "surface_0_5m_mean",
  "datum": null,
  "units": {"u": "m s-1", "v": "m s-1", "phase": "degrees"},
  "phase_convention": "greenwich_utc",
  "time_reference": "UTC",
  "direction_convention": "going_to",
  "constituents_h": [],
  "constituents_u": ["M2", "K1", "M4", "M6", "S2", "N2", "O1", "MS4", "K2", "P1", "Q1", "MN4", "2N2", "MK4"],
  "constituents_v": ["M2", "K1", "M4", "M6", "S2", "N2", "O1", "MS4", "K2", "P1", "Q1", "MN4", "2N2", "MK4"],
  "analysis": {
    "method": "least_squares_nodal_corrected",
    "record_start": "2026-09-16T00:15:00+00:00",
    "record_end": "2026-09-21T00:00:00+00:00",
    "record_hours": 119.75,
    "instants": 480,
    "step_minutes": 15,
    "rayleigh": 1.0,
    "resolved": ["M2", "K1", "M4", "M6"],
    "inferred_u": [{"name": "S2", "reference": "M2", "ratio": 0.2612, "lag_deg": 51.3}],
    "inferred_v": [{"name": "S2", "reference": "M2", "ratio": 0.2591, "lag_deg": 50.8}],
    "inference_reference": "ATLNE cell (53.8919, 8.9648)",
    "excluded_runs": [],
    "excluded_dates": [],
    "mean_is_weather": true
  },
  "validity_bbox": null,
  "confidence": "medium",
  "cells": 37679,
  "tiles": 2,
  "bbox": [53.8203, 8.6811, 53.9494, 9.2492],
  "build_at": "2026-09-19T09:12:41+00:00",
  "build_seconds": 4.8,
  "builder": {"script": "scripts/build_bsh_atlas.py", "git_commit": "a6fee98…"},
  "inputs": [{"file": "Current_CuxBru_2026091700_00.grb2.bz2", "sha256": "…", "instants_used": 96}]
}
```

Champs obligatoires : `format`, `schema_version`, `atlas`, `zone`, `rank`,
`resolution_m`, `grid`, `source` (avec `short`, `name`, `provider`, `url`,
`licence.name`, `licence.url`, `licence.read_at`, `attribution`,
`redistribution_of_derivative`), `variables`, `vertical`, `units`,
`phase_convention`, `time_reference`, `direction_convention`,
`constituents_h`, `constituents_u`, `constituents_v`, `build_at`, `builder`,
`inputs`.

Sens des champs qui ne se devinent pas :

- `rank` : **priorité explicite** dans la cascade, entier. Convention :
  0 bassin (≥ 2 km), 1 plateau (500 m à 2 km), 2 côtier (100 à 500 m),
  3 estuaire ou passe (< 100 m). À rang égal, la plus fine `resolution_m`
  gagne (tri actuel du registry : `(-rank, resolution_m)`). Le rang est
  décidé par le builder, pas déduit : c'est le seul moyen de faire passer un
  atlas récent et validé devant un atlas plus fin mais ancien ou hors de sa
  zone validée.
- `effective_resolution_m` : résolution que l'atlas résout vraiment
  (grille native du modèle source) quand `resolution_m` est celle de la
  grille régulière de sortie. Pour MARC les deux sont égales.
- `vertical` : `depth_averaged` (MARC, FES, AusTEN), `surface` (radar HF),
  `surface_0_5m_mean` (BSH), `layer_<z>m` (couche d'un modèle 3D). Un
  atlas de surface donne plus fort qu'un moyenné sur la verticale ; le
  runtime n'ajuste rien, la valeur est documentée pour la légende.
- `datum` : pour les hauteurs, `msl_analysis` (MARC : anomalie autour de la
  moyenne de la période d'analyse) ; `null` sans hauteurs. Conversion vers
  le zéro hydrographique par `z0_hydro_m` par cellule.
- `phase_convention` : uniquement `greenwich_utc` dans ce schéma. Un builder
  qui lit une source en phase locale (NOAA CO-OPS publie parfois en heure
  locale, les tables SHOM en phase locale « g » vs Greenwich « G ») convertit
  avant d'écrire : `G = g + σ × décalage_horaire`. La convention de signe
  est celle de `harmonic.predict`, `cos(σt + V0 + u − G)`.
- `analysis` : présent pour les atlas issus de séries. `resolved` = ajustés,
  `inferred_*` = liés à un constituant résolu par un rapport d'amplitude et un
  retard de phase (voir `harmonic_analysis.Inference`). `mean_is_weather` dit
  si `z0_*` reflète une moyenne climatologique (≥ 30 jours) ou la météo de
  la semaine.
- `validity_bbox` : optionnel, `[lat_min, lon_min, lat_max, lon_max]`. Là où
  un modèle a une emprise plus large que sa zone validée (ATLNE couvre la mer
  du Nord sans y avoir été validé par PREVIMER), ce champ permet de refuser
  la couverture hors zone. **Non implémenté dans le registry aujourd'hui**,
  proposé dans le rapport.
- `confidence` : `high` / `medium` / `low`, ce que `narrow_pass.confidence_for_point`
  déduit aujourd'hui du préfixe du label. Avec ce champ, la règle devient une
  lecture de métadonnée.
- `inputs` : empreinte SHA-256 de chaque entrée, pour reproduire un build.

## 5. `coverage.geojson`

`FeatureCollection` avec, dans l'ordre :

1. **feature 0, `kind: "bbox"`** : polygone rectangle des cellules valides.
   C'est ce que le runtime lit (`_scan_atlas` prend
   `features[0].geometry.coordinates[0]` et en déduit la bbox). Pour les
   atlas de rang 2 MARC, cette boîte est déjà rétrécie de 5 % (bande de
   bord non valide PREVIMER).
2. **feature 1, `kind: "tiles"`** : MultiPolygon des tuiles de 0,5° contenant
   au moins une cellule. Redondant avec l'arborescence, mais lisible par un
   client sans ouvrir de Parquet (la carte de méthodologie, l'endpoint de
   couverture).
3. optionnel, `kind: "valid"` : polygone fin des cellules valides (union de
   cellules ou enveloppe concave). Utile pour un affichage, jamais utilisé
   pour décider de la couverture (le runtime décide par la tuile contenante
   et la distance à la cellule la plus proche).

Propriétés communes à chaque feature : `atlas`, `rank`, `resolution_m`.

## 6. Priorité et recouvrements

- Le registry ne fait qu'une chose : parmi les atlas dont la bbox contient le
  point, essayer dans l'ordre `(-rank, resolution_m)` et garder le premier qui
  a une cellule dans la tuile contenante à moins de `max(5 km, 5 × résolution)`.
- Conséquence pour un nouvel atlas : choisir son `rank` en regardant ceux
  qu'il recouvre. BSH Elbe 90 m (rang 3) passe devant ATLNE 2 km (rang 0) ;
  BSH baie allemande 926 m (rang 1) passe aussi devant ATLNE (rang 0) et
  derrière un futur atlas côtier 250 m (rang 2).
- Le raccord aux frontières est brut : un point à 100 m de la limite d'un
  atlas de rang 3 bascule sur l'atlas de rang inférieur. Acceptable tant que
  les bords sont dans l'eau libre et que les deux atlas sont cohérents ; à
  surveiller aux embouchures (AusAlt / CuxBru se touchent sans se chevaucher).
  Un lissage à la frontière serait une fonction du runtime, pas du format.

## 7. Volumétrie

Par cellule : 16 octets de coordonnées + 8 octets par constituant et par
composante (deux float32). Un atlas de courants à 14 constituants u et v pèse
donc 240 octets par cellule brut, environ 190 octets en Parquet zstd (mesuré :
BSH CuxBru 37 679 cellules → 7,3 Mo ; BSH baie allemande 59 637 cellules →
11 Mo ; MARC FINIS 250 m avec 38 constituants h + u + v → 512 Mo).

Ordres de grandeur pour une couverture par bandes côtières (les cellules du
large ne servent à rien) :

| Étendue | Résolution | Cellules mer | Parquet |
|---|---|---|---|
| Baie allemande + Elbe (livré) | 926 m + 90 m | 0,2 M | 35 Mo |
| Mer du Nord + Manche + Irlande + Bretagne (CMEMS NWS) | 1,5 km | 1,2 M | 250 Mo |
| Europe côtière 20 km de bande | 1 km | 3 M | 600 Mo |
| Monde côtier 20 km de bande | 1 km | 25 M | 5 Go |
| Monde entier | 7 km (FES2014) | 3,5 M | 700 Mo |

Le runtime lit une tuile à la fois (`_read_tile`, LRU 128 tuiles) : la RAM
dépend du nombre de tuiles ouvertes par une requête, pas de la taille de
l'atlas. Ce qui grossit avec la couverture, c'est le disque du Space et le
temps de `coverage_cells()` (un footer Parquet par tuile au démarrage).

## 8. Versioning et reproductibilité

- `build_at`, `builder.git_commit`, `inputs[].sha256` et `source.licence.read_at`
  suffisent à rejouer un build et à dater la licence sous laquelle il a été
  fait.
- Un atlas publié ne change pas : un nouveau build va dans un nouveau
  répertoire du dataset (`BSH_CUXBRU` → remplacé en bloc, jamais patché
  tuile par tuile), et le dataset HF est taggé par date (`2026-09`).
- Les atlas sous licence redistribuable (CC BY, domaine public) vont dans un
  dataset public ; ceux qui ne le sont pas (MARC, engagement de non
  redistribution du brut) restent dans le dataset privé. Un déploiement
  monte les deux dans le même répertoire, le registry ne voit pas la
  différence.

## 9. Ce qui change par rapport aux atlas MARC construits (schéma 2)

| Point | Schéma 2 (MARC, sur disque) | Schéma 3 | MARC à rebâtir ? |
|---|---|---|---|
| Tuiles Parquet, colonnes `{C}_{h,u,v}_{amp,g}`, `lat`, `lon`, `z0_hydro_m` | identique | identique | **non** |
| Noms de constituants | graphies MARC (`Mf`, `La2`…) | canoniques, alias tolérés | non (alias au runtime) |
| Colonnes `Z0_u_amp`, `Z0_u_g` | présentes, ignorées par le prédicteur | tolérées, remplacées par `z0_u_ms` dans les nouveaux atlas | non |
| `metadata.json` | `atlas`, `rank`, `resolution_m`, `constituents_*`, `build_at`, `schema_version` | + `source`, `licence`, `zone`, `vertical`, `datum`, `units`, conventions, `grid`, `builder`, `inputs` | **non, migration des 7 JSON** (script à écrire, une minute) |
| `coverage.geojson` | bbox seule | bbox en feature 0 + tuiles en feature 1 | non (feature 1 optionnelle, calculable depuis l'arborescence) |
| Label de source (`marc_finis_250m`) | codé dans `router._marc_source_label` | `f"{source.short}_{zone}_{resolution_m}m"` lu des métadonnées | non |

Le registry actuel (`MarcAtlasRegistry`) lit déjà tout ce qu'un atlas au
schéma 3 contient de nécessaire : il ignore les clés qu'il ne connaît pas.
Les atlas BSH construits dans cette PR sont donc **chargeables par le
runtime tel quel** (vérifié en test : `MarcAtlasRegistry.from_directory`
sur un répertoire contenant `BSH_CUXBRU` répond aux `covers` et
`predict_current_series`). Ce qui manque au runtime pour être « générique »
tient en trois changements, décrits dans le rapport (section « Refacto du
registry ») : le label depuis les métadonnées, la confiance depuis les
métadonnées, `validity_bbox`.
