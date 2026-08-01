# MARC Atlas Format — reconnaissance Phase 0

Reconnaissance du FTP Ifremer `MARC_L1-ATLAS-AHRMONIQUES` (atlas PREVIMER de
composantes harmoniques de hauteurs et courants de marée) pour préparer
l'intégration dans OhMyWind.

Source : `ftp.ifremer.fr/MARC_L1-ATLAS-AHRMONIQUES/` (auth requise, login `ext-marc_atlasharmo`).
Documentation primaire : `2013_04_15_fiche_produit_atlas_V0.pdf` (téléchargé hors repo).

## Provenance

- Modèles **MARS2D** de PREVIMER (Ifremer + SHOM, cofinancement UE).
- Analyse harmonique du rejeu 2008-2009 via **Tidal ToolBox** (LEGOS).
- Version V0 de février 2013 (V1 partiel pour rang 2 en octobre 2013). Pas de
  mise à jour depuis. Acceptable pour des constantes harmoniques, qui sont par
  nature stables dans le temps.

**Citation obligatoire** (engagement PREVIMER) :
> Pineau-Guillou Lucia (2013). PREVIMER — Validation des atlas de composantes
> harmoniques de hauteurs et courants de marée. Rapport Ifremer, 89 p.
> http://archimer.ifremer.fr/doc/00157/26801/

## Structure des atlas

7 emprises géographiques :

| Code     | Rang | Résolution | Couverture                          |
|----------|------|------------|-------------------------------------|
| ATLNE    | 0    | 2 km       | Atlantique Nord-Est (large emprise) |
| MANGA    | 1    | 700 m      | Manche + Golfe de Gascogne          |
| FINIS    | 2    | 250 m      | Finistère (Brest, Iroise, Raz de Sein) |
| MANW     | 2    | 250 m      | Manche Ouest                        |
| MANE     | 2    | 250 m      | Manche Est                          |
| SUDBZH   | 2    | 250 m      | Sud Bretagne                        |
| AQUI     | 2    | 250 m      | Aquitaine (Gironde, Landes)         |

Convention de fichier : `<ONDE>-<VAR>-<MODELE>-atlas.nc`
- `ONDE` : nom du constituant (M2, S2, K1, ..., Z0)
- `VAR` : `XE` (hauteur), `U` (composante zonale), `V` (composante méridionale)
- `MODELE` : code de l'emprise

## Constituants disponibles

Famille | Constituants
--- | ---
Longue période | **Z0**, Mm, Mf
Diurnes | Q1, O1, P1, K1, M1, J1, OO1, Ro1, Pi1, 2Q1, Phi1, Sig1, Tta1, Psi1, Ki1, MP1, KQ1
Semi-diurnes | 2N2, N2, **M2**, **S2**, K2, Nu2, L2, T2, Mu2, E2, La2, KJ2, R2
Quart-diurnes | M4, MS4, MK4, MN4
Sixième-diurne | M6

- Hauteurs (XE) : 37 constituants disponibles partout.
- Courants (U/V) : 17 constituants pour ATLNE/MANGA, **38 constituants pour les
  rangs 2** (FINIS, MANW, MANE, SUDBZH, AQUI).

`Z0` est traité comme un "constituant à fréquence 0" : son amplitude représente
le **niveau moyen** (pour XE) ou le **courant résiduel moyen** (pour U/V) sur la
période d'analyse. C'est cette donnée qui nous permet de récupérer la composante
non-tidale moyenne dans les zones MARC.

## Schéma NetCDF

Conventions : `CF-1.5/1.6 OCO-1.3.1 COMODO-1.0`.

### Hauteur (XE)

```
Dimensions: (nj: 754, ni: 584)  # exemple FINIS, varie par modèle
Coordinates:
    nj         (nj)         float32
    ni         (ni)         float32
    longitude  (nj, ni)     float64   # grille curvilinéaire 2D
    latitude   (nj, ni)     float64
Data variables:
    XE_a       (nj, ni)     float32   # amplitude, units: m
    XE_G       (nj, ni)     float32   # phase, units: degrees (TU/UTC)
```

### Courant (U)

```
Dimensions: (nj_u: 754, ni_u: 584)
Coordinates:
    nj_u, ni_u (décalés en demi-pas par rapport à XE — Arakawa C-grid)
    longitude_u, latitude_u (2D)
Data variables:
    U_a        (nj_u, ni_u) float32   # amplitude, units: m s-1
    U_G        (nj_u, ni_u) float32   # phase, units: degrees (TU/UTC)
```

### Courant (V)

Symétrique de U avec coordonnées `nj_v`, `ni_v` décalées dans l'autre sens
(C-grid Arakawa : XE au centre, U sur les faces ouest-est, V sur les faces
nord-sud).

## Convention de la prédiction harmonique

Pour reconstruire la hauteur (ou les composantes U, V du courant) à un instant
`t` UTC :

```
h(lat, lon, t) = Σ_i  amp_i × f_i(t) × cos( ω_i × Δt + V0_i(t) + u_i(t) - G_i )
```

Avec :
- `amp_i = XE_a` au point (interpolé)
- `G_i = XE_G` au point (interpolé), en degrés
- `f_i(t)`, `u_i(t)` : corrections nodales (Schureman 1958)
- `V0_i(t)` : argument astronomique au temps t (longitudes moyennes
  Soleil/Lune/périgée etc.)
- `ω_i` : pulsation du constituant
- `Δt` : temps écoulé depuis l'epoch de référence

→ Rien de spécifique à MARC : c'est de la prédiction harmonique standard. Notre
prédicteur vectorisé NumPy peut s'en occuper sans dépendance externe.

## Valeurs typiques observées (FINIS, M2)

- `XE_a` : 0 à 2.79 m (moyenne 1.87 m sur la grille mer)
- `XE_G` : 93° à 150°
- `U_a` : 0 à 2.29 m/s = 0 à 4.45 kn
- `Z0-U_a` : 0 à 1.25 m/s = 0 à 2.4 kn (résiduel non-tidal, surtout dans les passes)

Cohérent avec le Finistère : pic M2 sur le Raz de Sein, résiduel élevé dans les
zones de débordement.

## Limitations

1. **Bord des domaines rang 2** : la fiche PREVIMER précise que les courants ne
   sont **pas valides** sur une bande d'environ 5-10 % de la taille du modèle
   aux limites. Conséquence directe : nos polygons de couverture doivent être
   les emprises **rétrécies** de cette bande, pas l'emprise complète.

2. **C-grid Arakawa** : XE, U, V sont sur des grilles décalées d'un demi-pas.
   Pour évaluer le courant `(u, v)` à un point, on doit interpoler U et V
   séparément à la position du point. À gérer dans le build script (rendu sur
   grille régulière offline) ou dans le predictor (à éviter, complexité runtime).

3. **Grille curvilinéaire** (longitude, latitude en 2D) : pas un meshgrid
   régulier. Pour interpoler à un (lat, lon) arbitraire :
   - Option A : KDTree ou interp `griddata` sur grille curvilinéaire (lent au
     runtime)
   - Option B : **regrid offline** vers une grille régulière dense (≈100 m à
     48°N) et stockage Parquet par tile 0.5°. Recommandé pour les performances
     runtime.

4. **Tidal-only sur les zones MARC** : MARC ne couvre pas la circulation
   atmosphérique transitoire (storm surge, Ekman du moment). Le `Z0` capture
   uniquement la **moyenne** sur la période d'analyse 2008-2009, pas la
   variabilité météo à court terme. Pour V2, c'est acceptable (la marée est
   l'écrasante majorité du signal en zone côtière française), mais à documenter
   dans `read_me`.

## Volume

Tailles fichiers (FINIS rang 2, observées) :
- XE : ~10.6 MB par constituant
- U : ~5.3 MB par constituant
- V : ~5.3 MB par constituant

Estimation download total :
- 5 atlas rang 2 × 38 const × (10.6 + 5.3 + 5.3) MB ≈ 4 GB
- MANGA rang 1 × 17 const : grille plus large, ~2-3 GB estimé
- ATLNE rang 0 × 17 const : grille plus large, ~2-3 GB estimé
- **Total brut ≈ 10 GB en NetCDF**

Après regrid + Parquet partitionné par tile 0.5° avec compression :
- Estimation 1-3 GB (Parquet compresse bien les float32 redondants)

Tient en HF Dataset privé sans souci. Pull au build du Space via
`huggingface_hub.snapshot_download`.

## Pas d'OPeNDAP

PREVIMER n'expose visiblement que du FTP. Pas de subset à la volée disponible.
Stratégie obligatoire : download → conversion offline → push HF Dataset → pull
au build du Space. Cohérent avec le brief original.

## Implications concrètes pour Phase 1 (build script)

- Télécharger les 7 atlases × (XE + U + V) × N constituants → ~10 GB temporaires
- Pour chaque atlas + variable :
  - Lire le NetCDF curvilinéaire
  - Interpoler U et V au centre des cellules XE (pour avoir un triplet (h, u, v)
    cohérent par cellule)
  - Regrid sur grille régulière (résolution cible : 0.001° en lat × 0.0015° en
    lon ≈ 100 m × 100 m à 48°N pour les rangs 2 ; 0.005° pour MANGA ; 0.02°
    pour ATLNE)
- Cropping : appliquer une marge de sécurité de 5-10 % sur les bords des rangs 2
  pour rester dans la zone de validité courants
- Output Parquet partitionné par tile 0.5° :
  - Schéma : `(lat, lon, constituent, h_amp_m, h_phase_deg, u_amp_ms, u_phase_deg, v_amp_ms, v_phase_deg)`
  - Partitions : `tile_lat=47.5/tile_lon=-5.0/data.parquet` etc.
- `coverage.geojson` : un MultiPolygon par atlas, avec attributs `name`,
  `resolution_m`, `priority` (rang 2 > 1 > 0 si overlap)

## Implications concrètes pour Phase 2 (prédicteur runtime)

- `harmonic.py` : prédicteur vectorisé NumPy
  - Tables des fréquences ω_i pour les 38 constituants
  - Schureman 1958 pour V0(t), f(t), u(t)
  - Vectorisation `(N_const, N_times)` × `(N_points, N_const)` → `(N_points, N_times)`
  - Cross-check vs `utide` en deps `[dev]` uniquement
- `marc_atlas.py` :
  - Load Parquet avec `pl.scan_parquet` (lazy)
  - STRtree shapely pour `covers()`
  - Interpolation bilinéaire des amplitudes/phases au point
  - `predict_height()`, `predict_current()` sur N temps
- `router.py` :
  - Cascade `marc_atlas.covers(lat, lon) ? marc : openmeteo_smoc`
  - Sélection rang le plus fin si overlap (rang 2 > 1 > 0)

## Convention de prédiction — résolue empiriquement

Validation end-to-end via REFMAR Brest 2008 (8232 obs horaires, source SHOM
data.shom.fr/maregraphie/observation/txt/3) :

- **MARC stocke la phase G en convention Greenwich standard** (formule SHOM
  classique `h(t) = Z0 + Σ Hᵢ cos(σᵢt + V0ᵢ(t) + uᵢ - gᵢ)`).
- Predictor utilisé : port direct des routines Schureman/Cartwright 1985 de
  `NOC-MSM/anyTide` (`NOCtidepred.py`), domaine public.
- Résultats :
  - PDF reference (Le Conquet 2009-01-01 00:00 UTC) : prédit -1.86 m vs
    référence -1.86 m → **diff 1 mm**.
  - Brest 2008 année complète vs REFMAR : **RMSE 14 cm, r² = 0.992**.
  - Brest n'est pas idéalement résolu en FINIS 250 m (le marégraphe est dans
    le port intérieur de la rade), donc 14 cm c'est très bon.

**Implications pour Phase 2 (predictor runtime)** :
- Pas besoin de re-rouler un predictor Schureman from scratch : porter
  `phamp0fast`, `longfindfast`, `ufsetfast`, `vsetfast` de NOC. ~250 lignes.
- Tables NOC ont 120 constituants Doodson-indexés ; mapping MARC → NOC
  trivial (M2 → idx 30, etc.).
- ⚠️ Ne pas utiliser `utide.reconstruct` ni `uptide.from_amplitude_phase`
  avec des constantes externes : ces libs sont conçues pour des `Coef`
  dérivés d'une analyse `solve()` interne, et n'appliquent pas V0(t) dans
  la convention Schureman standard pour des constantes d'entrée brutes.

## Z0-XE absent

PREVIMER ne publie pas `Z0-XE` (constituant à fréquence 0 en hauteur) parce
que l'analyse harmonique du rejeu est faite sur l'**anomalie** de niveau
(moyenne déjà soustraite). Conséquence : on prédit autour de MSL = 0.
La conversion vers ZH (zéro hydrographique français) se fait par calcul du
**minimum de la prédiction sur 19 ans** par cellule (offline, cache dans le
Parquet).

## Open questions résiduelles (non-bloquantes)

- **Z0-U / Z0-V (résiduel courant moyen)** : leur phase Z0_G n'a pas de sens
  physique pour un constituant à fréquence 0. À vérifier au build : soit
  Z0_G ≡ 0, soit la combinaison `Z0_a × cos(Z0_G)` donne un Z0 signé. Pour
  notre usage on les traite comme un constituant à `σ = 0`, le predictor
  donne le bon résultat dans les deux cas.
- **Période de référence des phases G** : empiriquement Schureman/Cartwright
  J2000 marche, donc la convention NOC est compatible. À documenter dans
  `harmonic.py` pour traçabilité.
