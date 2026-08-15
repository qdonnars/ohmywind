# OhMyWind : Méthodologie

> **Note** : ce document est destiné à être affiché aux utilisateurs (extrait
> dans le tool MCP `read_me`, footer du frontend web, README repo). Il est
> volontairement non technique. Pour les détails d'implémentation, voir les
> docs spécifiques dans ce répertoire.

## Sources de données

### Vent (multi-modèle)

Les prévisions vent proviennent d'**Open-Meteo Forecast API** (keyless, données sous CC BY 4.0) avec une cascade de modèles à horizon croissant :

- **AROME** (Météo-France, 1.3 km) : modèle haute résolution sur l'Atlantique
  français + Méditerranée, ~48 h. Capture les thermiques et les vents locaux.
- **ICON-EU** (DWD, 7 km) : Europe, ~5 jours.
- **ECMWF IFS** (Centre européen, 25 km) : global, ~10 jours.
- **GFS** (NOAA, 25 km) : global, ~16 jours, fallback.

Convention : vitesses en nœuds, directions en TWD ("from", convention météo).

### État de mer (vagues, courants totaux, niveaux)

**Open-Meteo Marine API** (basé sur Mercator SMOC, 8 km global, keyless) :

- Hauteur, période et direction des vagues (totales, vagues de vent, houle).
- Vitesse et direction des courants (somme tides + circulation océanique +
  dérive Stokes).
- Niveau de la mer relatif au MSL.

Couverture : monde entier, suffisant pour l'open-water et la Méditerranée.

### Marées et courants haute précision (Atlantique français, V2)

**Atlas harmoniques MARC** (PREVIMER, Ifremer + SHOM, version V0/V1 Février
2013), résolution 250 m sur les passes critiques (Finistère, Manche Ouest /
Est, Sud Bretagne, Aquitaine), 700 m en Manche / Golfe de Gascogne, 2 km en
Atlantique Nord-Est :

- Composantes harmoniques (38 constituants) pour la hauteur (XE) et le
  courant (U, V).
- Inclus le résiduel moyen non-tidal (Z0) sur les courants.
- Phase G en convention Greenwich standard (formule SHOM
  `h(t) = Z0 + Σ Hᵢ cos(σᵢt + V0ᵢ(t) + uᵢ - gᵢ)`), reconstruction par
  prédicteur Schureman/Cartwright 1985.
- Validation end-to-end vs marégraphe REFMAR Brest 2008 :
  RMSE 14 cm, r² 0.99 sur 8000+ observations horaires.

→ **Citation obligatoire** : Pineau-Guillou Lucia (2013). PREVIMER :
Validation des atlas de composantes harmoniques de hauteurs et courants de
marée. Rapport Ifremer, 89 p.
[archimer.ifremer.fr/doc/00157/26801/](http://archimer.ifremer.fr/doc/00157/26801/)

### Cascade de routing courants

À chaque waypoint, OhMyWind utilise la donnée la plus précise disponible :

```
si point ∈ emprise MARC valide  →  MARC (résolution la plus fine si overlap)
sinon                            →  Open-Meteo SMOC
```

Conséquence : couverture précise sur les passes côtières françaises (Raz de
Sein, Goulet de Brest, Raz Blanchard, etc.), fallback global ailleurs.
Sémantique : MARC ne capture que la composante tidale + résiduel moyen
2008-2009, pas la variabilité météo court-terme. Pour Brest et passes
similaires (>90 % de signal tidal), la précision MARC dépasse SMOC.

## Conventions

### Directions

Mixte par phénomène (standard métier, pas normalisé) :

- **Vent et houle** : "from" (TWD/TWA standard météo).
- **Courant** : "to" (standard océanographique / nautique).

Le serveur normalise explicitement quand il compare vent et courant
(détection vent contre courant pour le score de complexité).

### Référentiel hauteur

- **Open-Meteo** publie le niveau relatif au MSL (Mean Sea Level), valeurs
  signées.
- **MARC PREVIMER** ne publie pas de constante Z0-XE (analyse harmonique
  faite sur l'anomalie de niveau, moyenne pré-soustraite).
- Pour l'affichage en convention française : on calcule **Z0 hydrographique**
  (= niveau du zéro hydrographique relatif au MSL) comme le **minimum de la
  prédiction sur 19 ans** par cellule, dans les zones MARC. Hors zones MARC,
  on garde l'affichage MSL (les zones non-MARC sont la Méditerranée et le
  large, où le marnage est faible).

### Coefficient de marée

Calculé à partir des amplitudes des constituants principaux (M2 + S2
essentiellement) selon la formule SHOM `C = (H - N0)/U × 100`. Affiché dans
les zones MARC.

## Limites assumées

- **Courants tidal-only en zone MARC** : la composante atmosphérique
  variable (storm surge, dérive Ekman du moment) n'est pas capturée. Pour
  V2, le résiduel moyen (Z0) compense partiellement la moyenne climatologique.
- **Bord des modèles MARC rang 2** : les courants ne sont pas valides sur
  une bande de 5-10 % aux limites du domaine. On érode automatiquement le
  polygon de couverture sur les bords ouverts (côté large), pas sur les
  bords terre.
- **MARC est un produit V0 figé en 2013** : pas de mise à jour de la
  constante harmonique depuis. Les amplitudes/phases sont stables dans le
  temps (variation millimétrique sur 10 ans).
- **OhMyWind n'est pas un routeur** : pas d'optimisation, pas de
  `find_best_window`. On surface les données brutes (courants, étales, marnage,
  coefficient) et le LLM client rédige le conseil.
- **OhMyWind ne remplace pas un atlas SHOM ou une carte papier** pour la nav
  précise dans une passe étroite. C'est un outil de planification, pas de
  pilotage.

## Citations et licences

| Source | Licence | Citation |
|--------|---------|----------|
| Open-Meteo Forecast / Marine | CC BY 4.0 | open-meteo.com |
| AROME (via Open-Meteo) | Open Etalab 2.0 | Météo-France |
| SHOM Atlas C2D | Licence Ouverte Etalab 2.0 | SHOM, via data.gouv.fr |
| Atlas MARC PREVIMER | Engagement non-redistribution NetCDF brut, Parquet dérivé OK | Pineau-Guillou (2013), URL ci-dessus |
| Marégraphes REFMAR (validation) | Libre, source obligatoire | "REFMAR. http://dx.doi.org/10.17183/REFMAR#RONIM" |
| Code OhMyWind | AGPL-3.0-or-later, hors nom « OhMyWind » et identité visuelle | [LICENSE](../LICENSE), [TRADEMARK.md](../TRADEMARK.md) |

## Documentation technique

- [docs/marc_atlas_format.md](marc_atlas_format.md) : format NetCDF MARC,
  predictor, conventions, build pipeline.
- [packages/data-adapters/](../packages/data-adapters/) : sources des
  adapters et du predictor harmonique.
- [scripts/build_marc_atlas.py](../scripts/build_marc_atlas.py) : build
  offline des atlas MARC vers Parquet.
