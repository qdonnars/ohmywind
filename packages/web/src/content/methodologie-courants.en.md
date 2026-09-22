# Tidal currents

*This page is an English translation of the French original ([courants de marée](/methodologie/courants)), which remains the reference version.*

This page complements the OhMyWind [methodology](/methodologie). It describes where the tidal currents used to estimate a passage come from, how the source is chosen at each point of the route, what each source can see, and where the coverage stops.

## Contents

- [Sources, priority and coverage](#sources-priority-and-coverage)
- [How the current is derived at an atlas point](#how-the-current-is-derived-at-an-atlas-point)

## Sources, priority and coverage

For the critical passes, OhMyWind does not settle for SMOC at 8 km. Tidal currents come from a **cascade of atlases**: each atlas is a precomputed set of harmonic constants described by its metadata (source, licence, resolution, priority rank, validity area), and the engine only knows that format. Adding a region of the world means adding an atlas, not code.

**The sources in production.**

**1. SHOM Atlas C2D (Service Hydrographique et Océanographique de la Marine, the French naval hydrographic office).** The digital edition of the tidal-stream atlases of the French coast (Channel and Atlantic). These are not measurements: according to the product notice (2005 edition), they are outputs of tide models computed between 1988 and 2002 (TELEMAC-2D for most areas, finite differences for the Dover Strait and the Iroise), depth-averaged, adjusted on a few point measurements, and resampled on a grid of points looser than the model. That grid is finer than a kilometre in a few insets (Golfe du Morbihan 0.55 km, Rade de Brest and Sein 0.6 km, north Brittany insets) and 1.3 to 20 km elsewhere (Ouessant 1.3 km, Iroise and Hague 2.7 km, Pertuis 2.8 km, south Brittany 4.5 km, Channel 17 km, Biscay 20 km). Accuracy stated by SHOM: mean error below 15 % on maximum speeds at coefficient 95, phase offset of 30 to 60 min depending on the area, not assessed for the Iroise, Ouessant and the Rade de Brest. 9 atlases, about 13,000 points. Distributed on data.gouv.fr under the Licence Ouverte 2.0. At each point, two hourly series of 13 U/V values, one for spring tides (coefficient 95), one for neap tides (coefficient 45), from -6 h to +6 h around high water at the area's reference port.

**2. MARC PREVIMER (Modélisation et Analyse pour la Recherche Côtière, Ifremer + SHOM).** Continuous harmonic atlases on a regular grid, from the MARS 2D model on recent bathymetry. Resolutions: 250 m over Finistère, south Brittany, the Channel and Aquitaine, 700 m over the Channel and Bay of Biscay shelf, 2 km over the North-East Atlantic (the ATLNE atlas). 17 to 38 harmonic constituents per cell, Schureman/Cartwright predictor. Validation against the REFMAR tide gauge at Brest (2008, 8,000 hourly observations): RMSE 14 cm, r² 0.99 on height.

**3. Open-Meteo SMOC: the global fallback** (already described above, 8 km, tides from FES2014).

**The priority rule.** At every route point, the engine picks as follows:

```
if a SHOM C2D point lies within 500 m                →  SHOM (the fine insets, 50 to 150 m mesh)
else, among the atlases whose validity area           →  the atlas with the highest rank,
      contains the point                                 then the finest (250 m, 700 m, 2 km)
else                                                  →  Open-Meteo SMOC (global fallback, 8 km)
```

The rank is a decision written in the atlas metadata, not a deduction: 3 estuary or pass, 2 coastal, 1 shelf, 0 basin. At equal rank the finest resolution wins. The **validity area** confines an atlas to the waters its producer validated it in: ATLNE technically reaches the North Sea, but PREVIMER only validated it on the French coasts, and a comparison against three years of HF radar in the German Bight measured it 21 to 39 % under the observed currents, with 8 to 37° of phase lag. It is therefore confined to the Bay of Biscay, the Channel and the Celtic Sea; elsewhere the global fallback, whose tide comes from a globally validated model, is the honest answer.

Why 500 m for SHOM rather than "wherever it has a point": a bench over 750 shelf points, 16 passes and 1,500 random points (docs/bench/currents_resolution_2026-09-12_1347.md) showed that SHOM and MARC agree offshore whatever the distance (median gap 0.15 kt), that MARC recovers the peaks of the wide races and matches the Fromveur HF radars better, and that SHOM keeps the edge only where its model went down to 50 or 150 m, that is the sub-kilometre insets. The 500 m threshold selects exactly those.

**Precision and confidence.** The grid size of an atlas says what it can see: at 500 m or better, a pass; up to 1 km, an estuary; at 2 km, only "there is tide here"; at 8 km, the open sea. The confidence shown with each current value follows: high at 1 km or finer (SHOM, MARC 250 m and 700 m), medium beyond (ATLNE 2 km, SMOC). The `current_source` field exposed on each route leg gives the source actually used: `shom_c2d_558_morbihan`, `marc_finis_250m`, `openmeteo_smoc`. Under the currents table, a caption gives the detail: distance to the SHOM point sampled, grid size, or the 8 km cell of the fallback.

**What is covered, what is missing.** The map below shows the tidal current computed from the finest atlas available at each place (MARC at 250 and 700 m, BSH at 90 and 926 m, NorKyst at 800 m along the Norwegian coast, Copernicus at 1.5 and 4 km, ATLNE at 2 km, FES2014 at 7 km), completed by the known passes and races, in four colours: a green gradient where a tidal source at 5 km or finer covers, light at 0.5 kt to dark at 5 kt and above (the Alderney Race, the goulet de Brest, the Elbe), very pale where the same source answers but the tide stays under 0.5 kt (offshore Groix); for the areas over 1.5 kt that nothing covers, orange when an open-licence source is identified, purple when data exists but is closed or unclear, red when no source is known. A pass counts as covered at 1 km or finer, because a 3 km grid does not see a strait 3 km wide: a purple or orange dot can therefore sit in the middle of a green area, the area is covered, the pass itself is not (Gibraltar, Corryvreckan, Pentland Firth). A click on the sea asks the server and shows the source it would pick at that point. The source registry, folded under the map, gives each source's producer and its licence read and dated, can draw its extent, and ends with an address to propose one: not all of them are open data, and that is what paces the extension of the coverage.

<div data-widget="tidal-map"></div>

## How the current is derived at an atlas point

Every atlas of the cascade, except SHOM which publishes hourly series, shares the same format: the harmonic amplitudes and phases of the **U** (east-west) and **V** (north-south) components of the current are stored per cell (90 m to 4.2 km depending on the atlas), one value per astronomical constituent. To evaluate the current at a time $t$ and a given position, OhMyWind runs the Schureman/Cartwright predictor separately on U and V:

$$
U(t) = U_0 + \sum_{i=1}^{N} H_i^U \cdot f_i(t) \cdot \cos\bigl(\sigma_i \cdot (t - t_0) + V_{0,i}(t_0) + u_i(t) - G_i^U\bigr)
$$

and symmetrically for $V(t)$, where:

- $H_i^{U/V}$ and $G_i^{U/V}$: amplitude (m/s) and Greenwich phase (degrees) of constituent $i$ for the component considered, read from the atlas cell;
- $\sigma_i$: angular speed of constituent $i$ (degrees per hour, for example $\sigma_{M_2} = 28.9841$ °/h);
- $V_{0,i}(t_0)$: equilibrium astronomical argument at the start of the day of prediction, computed from the astronomical longitudes of Cartwright (1985);
- $f_i(t),\ u_i(t)$: nodal corrections (a slow variation over 18.6 years, tied to the motions of the moon);
- $U_0,\ V_0$: mean non-tidal residual for 2008-2009 included in the atlas (it captures the mean circulation, but not short-term weather variability).

OhMyWind reconstructs $U$ and $V$ this way for each sample, then derives the **speed** and the **direction** of the total current:

$$
V_{\text{current}} = \sqrt{U^2 + V^2}, \qquad \theta_{\text{current}} = \operatorname{atan2}(U,\ V)
$$

Oceanographic convention: $\theta_{\text{current}}$ gives the direction the current sets towards, in degrees true (0° = North, 90° = East). It is this value that is then projected onto the heading of the segment in the SOG calculation (step 6).

Constituents: 38 for MARC PREVIMER, 13 to 18 for the atlases we analyse ourselves (BSH, NorKyst, Copernicus, depending on the length of the series). For MARC, the set is a subset of the standard set of 60 constituents (dominated by M2, S2, N2, K2, K1, O1, P1: the semi-diurnal tide accounts for most of the signal on the French Atlantic coast). At Brest, more than 90 % of the variance of the horizontal current is carried by the tidal component, which justifies the native accuracy obtained (RMSE 14 cm on height, comparable ratios on the current).

