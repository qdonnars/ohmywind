# Courants de marée partout dans le monde, étape par étape

Rapport de recommandation issu de l'exploration `explore/tidal-currents-worldwide`
(2026-09-19). Mise à jour du 2026-09-20 : la branche `feat/tidal-currents-coverage`
regroupe ce rapport avec ce qu'il recommandait en premier, désormais fait :
registry générique et règles de priorité dans les métadonnées (section 8,
implémentée), ATLNE confiné à sa zone validée, page méthodologie avec la carte
interactive dans `packages/web`, et l'avertissement `currents.tidal_gap` quand
un tronçon sans source fine traverse une zone de fort courant. Les sections 8
et 11 se lisent donc au passé pour la première PR.

Chaque affirmation est marquée **[vérifié]** (source et date de consultation)
ou **[supposé]**. Les licences ont toutes été lues le **2026-09-19** par
recherche web, jamais de mémoire ; les URL sont dans le registre
[`map/sources.geojson`](map/sources.geojson) et reprises ci-dessous.

Documents liés :

- [`../harmonic_atlas_format.md`](../harmonic_atlas_format.md) : spec du format standard (schéma 3).
- [`spike-bsh.md`](spike-bsh.md) : spike bout en bout sur la source BSH (Allemagne).
- [`map/index.html`](map/index.html) : carte interactive (ouvrir le fichier dans un navigateur).
- `.github/workflows/archive-bsh-currents.yml` : archivage quotidien, désactivé par défaut.

## Résumé

1. **La prémisse « hors France on retombe sur SMOC » est fausse pour l'Allemagne** [vérifié]. MARC ATLNE (2 km, 17 constituants de courant) couvre la mer du Nord entière et répond `marc_atlne_2000m` à Cuxhaven, Helgoland, Texel et au Skagerrak. Ce qu'il répond est faux : 0,09 kt devant Brunsbüttel et 0,8 kt à Cuxhaven sur 24 h, contre 2 à 3,5 kt publiés et 4,6 kt dans la prévision BSH du 19 septembre. Le problème allemand est « ATLNE hors de sa zone validée », et il est aujourd'hui masqué par un label de confiance `high`.
2. **Une source ouverte, sans clé, en CC BY 4.0, résout la baie allemande à 0,5 nm et l'Elbe à 90 m** [vérifié] : les prévisions de courant de surface du BSH (`ftp.bsh.de/Stroemungsvorhersagen`). Le spike a construit quatre atlas au format standard à partir de trois jours d'archive et les a validés contre trois ans de radar HF : sur six points au large, phase M2 à moins de 19° (40 minutes) et inclinaison à moins de 14° des observations, amplitude +6 à +23 % ; ATLNE sous-estime M2 de 21 à 39 % et retarde de 8 à 37°.
3. **FES est tranché** [vérifié, texte de licence lu in extenso] : la licence AVISO Issue 20 (effective 10 août 2026) réserve le non commercial aux courants de la *dernière* version FES (FES2022, annexe A) ; les courants **FES2014 sont sous licence standard**, usage commercial et dérivés autorisés. Les deux lectures internes étaient vraies, pour deux versions différentes.
4. **La direction « un format, un registry, N builders » tient** avec deux amendements : le rang de priorité doit être explicite dans les métadonnées (pas déduit de la résolution) et une `validity_bbox` doit pouvoir restreindre un atlas à sa zone validée. Le registry actuel lit déjà les atlas BSH tels quels ; trois petits changements le rendent générique (section 8).
5. **Roadmap** : (1) Allemagne par BSH, archive d'un mois puis d'un an ; (2) fallback tidal mondial par FES2014 (compte AVISO) ou par analyse du `utide/vtide` de SMOC ; (3) UK, Irlande, mer du Nord, Manche par CMEMS NWS 1,5 km (compte Copernicus) ; (4) Norvège par NorKyst800 et Danemark par DMI ; (5) Amérique du Nord par NOAA OFS et ECCC CIOPS. Les trous qui restent sans source ouverte sont listés en 9.

## 1. Où on en est [vérifié dans le code]

Cascade dans `packages/data-adapters/src/openwind_data/currents/router.py` :
SHOM C2D (à moins de 0,5 km d'un point) > MARC (rang le plus élevé, puis
résolution la plus fine) > Open-Meteo SMOC. Vérifié par lecture de
`router.py`, `marc_atlas.py`, `shom_c2d_registry.py`, `narrow_pass.py` et
des builders `scripts/build_marc_atlas.py`, `scripts/build_shom_c2d.py`.

Ce que le registry sait faire aujourd'hui et qui est réutilisable tel quel :
découverte par `metadata.json`, tuiles 0,5° lues à la demande (LRU 128),
cellule la plus proche par variable avec recherche dans les tuiles voisines,
seuil `max(5 km, 5 × résolution)`, prédiction vectorisée. Il ne sait pas :
lire un label de source dans les métadonnées (`_marc_source_label` est codé
en dur), lire une confiance dans les métadonnées (`narrow_pass` regarde le
préfixe du label), refuser une zone non validée.

Mesure faite le 2026-09-19 sur les atlas locaux (`build/marc`, identiques
au dataset HF) :

| Point | Atlas répondu | Courant max sur 24 h (prédit) |
|---|---|---|
| Cuxhaven (53,87 N 8,70 E) | ATLNE 2 000 m | 0,78 kt |
| Elbe devant Brunsbüttel | ATLNE 2 000 m | 0,09 kt |
| Helgoland | ATLNE 2 000 m | 0,54 kt |
| Texel (Marsdiep) | ATLNE 2 000 m | 0,49 kt |
| Skagerrak | ATLNE 2 000 m | 0,08 kt |
| Détroit de Douvres | MANE 250 m | 1,46 kt |
| Portland Bill | MANGA 700 m | 1,53 kt |
| Bergen, Gibraltar, Lisbonne | non couverts (SMOC) | |

Contrôle indépendant des hauteurs ATLNE contre les constantes TICON-3
(DGFI-TUM, CC BY 4.0, marégraphes GESLA-3, lues le 2026-09-19) [vérifié] :

| Marégraphe | M2 TICON-3 | M2 ATLNE (cellule voisine) | Écart |
|---|---|---|---|
| Cuxhaven (1917-2018) | 134,9 cm / 343,6° | 94,1 cm / 19,5° | −30 %, +36° (1 h 14 de retard) |
| Helgoland (2014-2020) | 106,0 cm / 311,1° | 93,7 cm / 321,2° | −12 %, +10° |

Le rapport d'un utilisateur (« sur l'Elbe l'heure de départ ne change pas
l'ETA ») est donc reproductible : à 2 km, la maille ATLNE devant
Brunsbüttel est un mélange terre-eau qui donne 0,1 kt, et PREVIMER n'a
jamais validé ATLNE en mer du Nord (le rapport de validation 2013 porte sur
les côtes françaises) [vérifié : `docs/marc_atlas_format.md`, citation
Pineau-Guillou 2013].

## 2. Direction confirmée, avec deux amendements

**Confirmé** : un seul format d'atlas harmonique (schéma 3, spec dans
`docs/harmonic_atlas_format.md`), un seul registry, un builder par source.
Le spike l'a éprouvé de bout en bout : `scripts/build_bsh_atlas.py` écrit le
format, et `MarcAtlasRegistry.from_directory()` charge le résultat sans
modification (`covers`, `predict_current_series` répondent). Le moteur n'a
pas changé.

**Amendement 1, le rang est une décision, pas une déduction.** Trier par
résolution suffirait ici (90 m < 926 m < 2 000 m) mais ne répondrait pas au
cas ATLNE : un atlas plus fin mais ancien, ou hors de sa zone validée, doit
pouvoir perdre. Le format porte donc un `rank` explicite décidé par le
builder (0 bassin, 1 plateau, 2 côtier, 3 estuaire/passe), et à rang égal la
résolution départage. Décision du 2026-09-20, en préparant les atlas
Copernicus : ATLNE passe du rang 0 au rang 1 (c'est un atlas de plateau
validé par PREVIMER), et les atlas régionaux Copernicus (NWS 1,5 km, IBI
3 km, MED 4,2 km) comme FES2014 (7 km) prennent le rang 0. Sans cela, NWS à
1,5 km aurait battu ATLNE à 2 km sur toute la façade française par la seule
résolution, alors qu'il n'y est pas validé et qu'il s'écarte de 10 à 40 %
du radar en baie allemande (`spike-cmems.md`). `migrate_atlas_metadata.py`
porte la décision.

**Amendement 2, `validity_bbox`.** Un atlas peut déclarer une boîte de
validité plus petite que son emprise. Hors de cette boîte, `covers` refuse
et passe au suivant. C'est le moyen de garder ATLNE en Atlantique et de le
retirer de mer du Nord dès qu'un meilleur atlas y existe, sans le rebâtir.

**Ce que je challenge** : l'idée que le monde entier passe par des
constantes harmoniques. Là où la marée est faible et la météo domine
(Baltique, Méditerranée, Skagerrak intérieur), un atlas harmonique est
inutile et un modèle de prévision (SMOC ou mieux) reste la bonne réponse.
Le format n'en souffre pas : il suffit de ne pas construire d'atlas là.

## 3. Inventaire des sources

Colonnes : emprise, résolution native, type (**CH** constantes harmoniques,
**ST** séries temporelles à analyser, **PT** points station, **PG** grille
de prévision), constituants, vertical (**DA** moyenné sur la verticale,
**S** surface), format, accès, volume, licence lue le 2026-09-19 (URL),
attribution, redistribution d'un dérivé (nos Parquet), statut.

### 3.1 Europe

| Source | Emprise | Résolution | Type | Constituants | Vert. | Format | Accès | Volume | Licence (URL) | Attribution | Dérivé redistribuable | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **BSH Strömungsvorhersagen** [vérifié, FTP et README lus] | mer du Nord 3 nm ; baie allemande, Frise N et E 0,5 nm ; Elbe 90 m ; Baltique | 5,6 km / 926 m / 90 m | PG, 15 min, 2 runs/jour, 2 à 3 jours | à analyser | S (0 à 5 m) | GRIB2 (u, v en m/s, param. 10-1-2/3) | FTP anonyme, sans clé | 55 Mo/jour pour les 8 zones allemandes | CC BY 4.0, `ftp://ftp.bsh.de/Stroemungsvorhersagen/LICENSE.txt` (daté 2026-08-03) ; la fiche GDI-DE du même modèle dit DL-DE-BY-2.0 | « Data provided by BSH, CC BY 4.0 », indiquer les modifications | oui | **OK, spike fait** |
| **CMEMS NWS 004_013** [vérifié via PUM et fiche produit] | 16 W à 13 E, 46 à 63 N | 1,5 km, 33 niveaux | PG horaire et 15 min, marée incluse, produit « detided » aussi | à analyser | S et 3D | NetCDF, toolbox `copernicusmarine` | compte gratuit | 1 an de u/v surface horaire sur la baie allemande ≈ 4 Go | Licence Copernicus Marine, `marine.copernicus.eu/user-corner/service-commitments-and-licence` : usage commercial, dérivés et redistribution autorisés | « Generated using E.U. Copernicus Marine Service Information; DOI » | oui | OK, pas d'identifiant en local |
| **CMEMS IBI 005_001** [vérifié] | 19 W à 5 E, 26 à 56 N | 1/36° (≈ 2,5 km), 50 niveaux | PG horaire (surface), 2 ans + 10 jours | à analyser | S et 3D | NetCDF | compte gratuit | idem | idem | idem | oui | OK |
| **CMEMS SMOC 001_024** [vérifié] | monde | 1/12° (8 km) | PG horaire ; `utide/vtide` = FES2014 sur grille 1/12° | FES2014 | S | NetCDF | compte gratuit ; via Open-Meteo sans clé | | idem | idem | oui | **dans la cascade** (fallback) |
| **NorKyst800** [vérifié, fiche ADC] | 1,6 W à 38 E, 55,8 à 75,2 N | 800 m, 35 niveaux, grille polaire stéréo | PG horaire, archive depuis 2017 | à analyser | S et 3D | NetCDF OPeNDAP `thredds.met.no` | sans clé | 1 an surface Norvège ≈ 20 Go | CC BY 4.0 / NLOD, `adc.met.no/dataset/90e1c0ba-…` | MET Norway | oui | OK |
| **Marine Institute NE Atlantic ROMS** [vérifié, fiche geonetwork] | 18 W à 1 W, 48 à 58 N | 1,9 km, 40 niveaux ; 200 à 250 m Galway et Bantry | PG, depuis 2012 (pas de temps à confirmer) | à analyser | 3D | NetCDF ERDDAP | sans clé | non mesuré | CC BY 4.0, `data.marine.ie/geonetwork/…/ie.marine.data:dataset.3778` | Marine Institute | oui | OK |
| **DMI Open Data, DKSS** [vérifié via registre AWS ; page « terms » DMI en 404] | mer du Nord, Skagerrak, Kattegat, Baltique | non confirmée | PG, 4 runs/jour, 5 jours ; rétention 48 h | à analyser | S et 3D (52 niveaux) | GRIB (STAC), JSON (EDR) | clé API gratuite ; miroir S3 sans signature | non mesuré | CC BY 4.0, `registry.opendata.aws/dmi-opendata/` | DMI | oui | OK |
| **SMHI** [vérifié licence, données non confirmées] | Baltique, Kattegat | | PG | | | | sans clé | | CC BY 4.0 SE, `smhi.se/data/om-smhis-data/villkor-for-anvandning` | SMHI | oui | à clarifier (champs de courant ?) |
| **FES2014 courants** [vérifié, licence PDF lue] | monde | 1/16° (7 km) | CH | 34 (u, v, h) | DA | NetCDF | compte AVISO+ gratuit, FTP/THREDDS | ≈ 1 Go | Licence AVISO Issue 20 du 10/08/2026, `aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf` : version précédente = licence standard, commercial autorisé | citation produit + CNES/AVISO + lien licence + mention des modifications | oui (seule la redistribution en masse de l'original est soumise à autorisation, section 3.2) | **OK** |
| **FES2022 courants** [vérifié] | monde | 1/16° | CH | | DA | | sur demande, équipes scientifiques | | même licence, annexe A : non commercial | | non | **bloqué** (se libère à la version suivante) |
| **TPXO10-atlas** [vérifié] | monde | 1/30° | CH | | DA | | inscription | | académique / non commercial, `tpxo.net/tpxo-products-and-registration` ; licence commerciale via ModEM | | non | **bloqué** |
| **EOT20** [vérifié] | monde | 1/8° | CH | 17, hauteurs seulement | | NetCDF | SEANOE sans clé | 2 Go | CC BY 4.0 | | oui | sans courants |
| **Puertos del Estado SAMOA** [vérifié, FAQ lue] | Espagne, Gibraltar, Baléares | sub-km côtier | PG 3D, +72 h | | S et 3D | NetCDF THREDDS | sans clé | | FAQ `puertos.es/en/services/oceanography/faqs` : « under no circumstances is the transfer of the data to third parties permitted » | obligatoire | **non** | **bloqué** pour un dérivé publié |
| **UKHO ADMIRALTY** [vérifié, modèle de licence lu] | UK, Irlande, île de Man, Anglo-Normandes | | PT (3 000 stations de courant) | | | | abonnement payant | | licence commerciale ; « low-value » plafonnée à 1 port ≤ 1 an | | non | **bloqué** |
| **ABPmer Renewables Atlas** [vérifié] | UK | 1,8 km | CH (ellipses, pics) | | DA | shapefile | accord signé | | propriétaire ABPmer, `metadata.naturalresources.wales/…/EXT_DS121665` | | non | **bloqué** |
| **SSW-RS Écosse** [vérifié] | 13 W à 13 E, 48 à 62 N | FVCOM non structuré | ST horaire, réanalyse 1993-2019 | à analyser | S et 3D | NetCDF | inscription JASMIN | To | Open Government Licence UK, `marine.gov.scot/information/scottish-shelf-waters-reanalysis-service` | OGL | oui | à clarifier (volume, maillage) |
| **Rijkswaterstaat** [vérifié, page open data lue] | Pays-Bas | stations ; DCSM-FM via Matroos | PT, ST | | | API | Waterinfo sans clé ; Matroos mot de passe gratuit, 3 semaines | | « vrij inzien en hergebruiken », **aucun texte de licence** | non requise | oui, sans licence opposable | à clarifier |
| **NOC Atlas of Tides AMM7** [non confirmé : Zenodo en 504] | plateau NO européen | 7 km | CH | 115, hauteurs d'après la fiche NORA | | | Zenodo | | non lue | | | sans courants (probable) |
| **COSYNA radar HF** [vérifié, attributs ERDDAP lus] | baie allemande 5,9 à 9 E, 53,4 à 55,2 N | 2 km | ST 20 min, 2019-01 à 2022-10 | à analyser | S (0,3 à 2,5 m) | ERDDAP CSV/NetCDF | sans clé | 6 Mo par point sur 3 ans | CC BY 4.0 (attribut `license` du jeu NRT) | Hereon / COSYNA | oui | OK, **référence de validation** |
| **Pegelonline** [vérifié] | Allemagne | stations | PT hauteurs, 30 jours | | | REST JSON | sans clé | | DL-DE Zero 2.0, `pegelonline.wsv.de/gast/nutzungsbedingungen` | aucune | oui | OK, hauteurs seulement |
| **MARC PREVIMER** [vérifié] | 20 W à 15 E, 40 à 65 N | 2 km / 700 m / 250 m | CH | 17 à 38 | DA | NetCDF → Parquet | FTP Ifremer avec compte | 5,3 Go en Parquet | engagement de non redistribution du brut, citation Pineau-Guillou 2013 | obligatoire | brut non, dérivés tolérés (déjà servis par l'app) | **dans la cascade** |
| **SHOM C2D** [vérifié sur data.gouv.fr, édition NetCDF non confirmée] | cartouches françaises | 500 m à 20 km (30 m à 2 km dans l'édition NetCDF) | PT | séries relatives à la PM, coef 45 et 95 | DA | ASCII → Parquet | data.gouv.fr (fiche archivée), diffusion.shom.fr | | **Licence Ouverte 2.0** sur la fiche data.gouv.fr « Courants de marée des côtes de France (Manche/Atlantique), produit numérique » ; la recherche signale une édition NetCDF 2026 (DOI 10.17183/ATLASCOURANTS2D_NETCDF) sous la même licence, non lue par moi | « Source : Shom » + date | oui si la licence de l'édition téléchargée est bien la Licence Ouverte | **dans la cascade** ; découverte : les artefacts C2D pourraient aller dans le dataset public |
| **BSH WMS « Gezeitenstrom Positionen »** [vérifié par GetFeatureInfo] | côtes allemandes | points | PT, 13 pas horaires HW Helgoland −6 à +6 h, vive-eau et morte-eau | | | WMS | sans clé | | DL-DE-BY-2.0 | BSH | oui | OK, référence de validation |
| **WSV service SOS, courants Elbe** [vérifié, appels testés] | Elbe, stations LZ et D1 à D4 | points | ST 5 min, 1997 à 2025 selon station | | capteur 2,5 m au-dessus du fond | OGC SOS JSON | sans clé | | DL-DE Zero 2.0 | aucune | oui | OK, mesures ; non exploitées dans le spike |
| **TICON-3** [vérifié, fichier téléchargé] | marégraphes du monde | points | CH hauteurs | 40 | | texte | PANGAEA sans clé | 2,7 Mo | CC BY 4.0 | Hart-Davis et al. 2022 | oui | OK, contrôle de phase des hauteurs |

### 3.2 Hors Europe [recherche déléguée à un sous-agent, pages lues le 2026-09-19]

| Source | Emprise | Résolution | Type | Constituants | Vert. | Accès | Archive | Licence (URL) | Dérivé redistribuable | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| **NOAA CO-OPS harcon courants** [vérifié live sur `cb0102`] | côtes US, Alaska, Hawaï, Grands Lacs | stations, bins de profondeur | PT, CH | 37 | par bin | REST sans clé (`mdapi …/harcon.json?bin=N`) | permanent | domaine public, `tidesandcurrents.noaa.gov/disclaimers.html` | oui (attribution demandée, non obligatoire) | OK |
| **NOAA OFS** (CBOFS, DBOFS, TBOFS, GoMOFS, NGOFS2, SFBOFS, SSCOFS, CIOFS, WCOFS, lacs) [vérifié live S3] | baies et façades US | 10 m à 14 km selon système | PG 3D horaire, marée incluse | à analyser | S et 3D | S3 `noaa-ofs-pds` sans clé, THREDDS | S3 ≈ 30 jours ; `noaa-nos-ofs-pds` depuis 2022-01 | NODD, `registry.opendata.aws/noaa-ofs/` : « can be used as desired » | oui | OK, 62 Mo par fichier de champs CBOFS |
| **ECCC CIOPS East / West / Salish Sea** [vérifié live Datamart] | Canada atlantique et pacifique | 2 km ; Salish Sea 500 m | PG horaire, marée incluse, `SeaWaterVelocityX/Y` à 0,5 m et 3D | à analyser | S et 3D | HTTPS `dd.weather.gc.ca` sans clé | 30 jours | Open Government Licence Canada 2.0 + licence ECCC Data Services v2.1.1 (août 2026) | oui | OK, ≈ 1 Go/jour pour les 3 domaines en surface |
| **DFO WebTide** [vérifié : lien « terms » en 404, conditions génériques GoC lues] | Canada, Fundy, Arctique | maillage EF | CH (h, u, v) | 8 (non confirmé) | DA | téléchargement libre | statique | pas de licence propre ; conditions GoC : pas de redistribution commerciale sans autorisation écrite | **non** | **bloqué** |
| **CSIRO AusTEN** [vérifié] | plateau australien | non structuré, jusqu'à 500 m | CH (h, u, v) + 95 courantomètres | 11 | DA | CSIRO DAP sans clé | statique v3 | **CC BY-SA 4.0**, DOI 10.25919/q8dw-c732 | oui, mais share-alike | à clarifier (viral) |
| **eReefs GBR1/GBR4** [vérifié] | Grande Barrière | 1 km / 4 km, 44 niveaux | PG 3D horaire, marée TPXO incluse | à analyser | 3D | THREDDS sans clé | 2010-2024 | CC BY 4.0, `ereefs.org.au/outputs/open-access-datasets/marine-model-results` | oui | OK, To |
| **NIWA ZEE / LINZ** [vérifié partiellement] | Nouvelle-Zélande | | CH | 8 publiés | | aucun téléchargement ouvert trouvé | | Crown copyright (LINZ) ; NIWA non précisé | non confirmé | à clarifier, de facto fermé |
| **KHOA** [vérifié] | Corée | grille non confirmée | PG | | S | clé API gratuite data.go.kr | temps réel | KOGL type 1 (attribution, commercial OK) | oui | OK, effort élevé |
| **JODC** [vérifié] | Japon | points | ST | | | libre après recherche | long | politique IOC : non commercial | **non** | **bloqué** |
| **SANHO** [vérifié] | Afrique du Sud | | PT | | | publication | | reproduction interdite sans autorisation écrite | non | **bloqué** |
| Chili, Brésil, Chine, Portugal IH, Italie (Messine), Grèce (Euripe) | | | | | | | | aucune donnée ouverte de courant identifiée ; Messine : publication payante de l'Istituto Idrografico | | absents |
| HAMTIDE, DTU, TICON, ArcTiCA, GTSM/CDS, HYCOM | monde | | CH ou ST | | | | | hauteurs seulement, ou marée absente (HYCOM) | | sans courants |

Ce que je n'ai pas pu confirmer : la résolution du domaine DKSS « idw »
du DMI ; la disponibilité en open data des champs de courant SMHI et FMI ;
le pas de temps de l'ERDDAP du Marine Institute ; les constituants et le
format des bases WebTide ; la licence du NOC Atlas of Tides (Zenodo
injoignable) ; la licence AIMS pour les agrégats eReefs (la fiche NCI dit
CC BY 4.0, la page AIMS n'affiche rien).

## 4. Licences : le cas FES [vérifié, texte lu in extenso]

Licence AVISO Issue 20, effective le 10 août 2026, remplace l'Issue 19 de
février 2024. Points qui tranchent :

- Section 2.1 : licence « worldwide, royalty-free, non-exclusive,
  irrevocable » pour reproduire, partager et produire des dérivés « for any
  purpose, including commercial purposes ».
- Section 3.2 : interdiction de re-diffuser **l'original non modifié** via
  une plateforme de diffusion de masse sans autorisation. Ne s'applique pas
  aux dérivés (dit explicitement). Nos Parquet sont des dérivés.
- Section 3.3 et annexe A : **non commercial pour « Currents from the latest
  released version of the FES ocean tide model (currently FES2022) »**. Note
  de l'annexe : « Once a newer version is released, the restriction moves to
  that new version, and the previous version becomes available under the
  standard License terms (including for Commercial Use) ».
- Page FES2022 d'AVISO (lue le même jour) : « the FES2014 currents are now
  also delivered for any purpose under the standard licence » et « The
  FES2022 currents are not disseminated yet ».

Conclusion : **FES2014 courants = utilisable**, avec attribution (produit,
CNES/AVISO, lien vers la licence, mention des modifications), y compris
pour publier nos Parquet dérivés. **FES2022 courants = bloqué** jusqu'à la
sortie de FES2026 ou équivalent. Il faut un compte AVISO+ (formulaire, pas
de credential en local aujourd'hui).

Alternative sans compte AVISO : SMOC (Copernicus, via Open-Meteo) contient
`utide` et `vtide`, qui sont FES2014 rééchantillonné à 1/12°. Un mois
d'archive horaire de ces deux champs, analysé avec `harmonic_analysis`,
redonne M2, S2, N2, K1, O1, M4 à 8 km, sous licence Copernicus. C'est un
fallback mondial honnête, moins fin que FES2014 natif (1/16°), mais
constructible sans autre compte que Copernicus. Attention au quota
Open-Meteo : l'archive se fait par la toolbox Copernicus, pas par
l'API Open-Meteo.

Contrainte de projet à garder en tête pour toutes les sources : AGPL-3.0 +
sponsoring de marques. Toute clause « non commercial », « research and
education » ou « pas de cession à des tiers » est bloquante, ce qui exclut
TPXO, FES2022, WebTide (conditions génériques du gouvernement canadien),
JODC, Puertos del Estado, UKHO, ABPmer, SANHO. La CC BY-SA d'AusTEN n'est
pas bloquante pour l'usage, mais elle impose de publier le Parquet dérivé
sous CC BY-SA : à arbitrer, ce n'est pas une contamination de l'AGPL du
code, seulement du dataset.

## 5. Enjeux techniques d'agrégation

| Enjeu | Constat | Recommandation |
|---|---|---|
| **Grilles hétérogènes** (régulière BSH, curvilinéaire MARC, polaire NorKyst, non structurée AusTEN, SSW-RS) | Le runtime fait « cellule la plus proche » dans une tuile, il n'interpole pas. | Regrid **hors ligne** vers une grille régulière lat/lon au pas natif (ce que fait déjà `build_marc_atlas.py`, interpolation complexe pour les phases). Grille native conservée quand elle est déjà régulière (BSH). Nearest au runtime reste suffisant tant que la maille est ≤ à l'échelle des structures ; c'est la résolution de la source qui compte, pas l'interpolation. |
| **Convention de phase** | MARC, FES, NOAA harcon, AusTEN publient en phase Greenwich (UTC). NOAA publie aussi des « local » ; les tables SHOM papier sont en phase locale. | Un seul champ `phase_convention: greenwich_utc` dans le format ; un builder qui lit du local convertit `G = g + σ × Δt`. Pour les séries, l'analyse dans la convention du prédicteur garantit la cohérence par construction (test d'aller-retour exact). |
| **Unités** | m/s partout dans les modèles ; nœuds dans NOAA harcon ; cm/s parfois. | SI dans l'atlas, nœuds au runtime. Une seule constante de conversion, déjà en place. |
| **Nommage des constituants** | `Mf`/`MF`, `Mu2`/`MU2`, `La2`/`LAM2`, `Ki1`/`CHI1`, NOAA `RHO`/`RO1`, `LAM2`/`LDA2`. | Noms canoniques NOC-60 dans les nouveaux atlas ; table `ALIASES` étendue à la demande (NOAA `RHO`, `LDA2`, `2MK3`, `M8` inconnus aujourd'hui, à ajouter quand NOAA entre). |
| **Nombre minimal de constituants pour le routage** | Sur un plateau à marée semi-diurne, M2 + S2 + N2 + K1 + O1 donnent > 95 % de la variance ; M4 (+ MS4, M6) comptent dans les estuaires pour l'asymétrie flot/jusant (Elbe : flot plus court et plus fort). | Minimum **8** : M2, S2, N2, K2, K1, O1, M4, MS4 ; **14** confortable (+ P1, Q1, MN4, M6, 2N2, NU2). Au-delà, rendement décroissant pour un ETA à la demi-heure. |
| **Sources sans constantes (séries)** | Rayleigh : 15 jours pour S2, 29 jours pour N2, 183 jours pour K2 et P1, 1 an pour SA. Un modèle de prévision porte aussi la météo. | Archiver **≥ 1 an** pour un atlas définitif ; **≥ 29 jours** pour un atlas utilisable (M2, S2, N2, K1, O1, M4, MS4 ; K2 et P1 inférés). Coût : `GridAnalysis` en flux, ~10 s par million de cellules-jours sur un portable ; 1 an d'Elbe 90 m ≈ 20 minutes. Qualité : la moyenne `z0` n'a de sens qu'au-delà de 30 jours (`mean_is_weather`). `utide` n'est pas nécessaire : le module maison partage le code du prédicteur, ce qu'`utide` ne fait pas (conventions V0 différentes, déjà documenté). |
| **Estuaires à débit fluvial (Elbe)** | Le débit se voit dans la moyenne et dans l'asymétrie ; un atlas harmonique fige une moyenne. À Cuxhaven, le hold-out montre 0,18 kt de biais sur la vitesse sans la moyenne, 0,16 avec. | Stocker `z0_u_ms`/`z0_v_ms` (déjà), ne pas les appliquer au runtime (déjà le cas), documenter dans la légende que les crues ne sont pas dans l'atlas. Niveau 2 : un correctif de débit via Pegelonline (hauteur à Neu Darchau) hors périmètre. |
| **Datum des hauteurs** | MARC : anomalie autour de la moyenne d'analyse ; BSH : pas de hauteurs dans le produit courant ; FES : hauteurs autour du niveau moyen. | `datum: msl_analysis` + `z0_hydro_m` par cellule (calcul 19 ans, déjà fait pour MARC). Les atlas de courants seuls déclarent `datum: null`. |
| **Recouvrements et priorité** | Trois critères possibles : résolution, ancienneté, rang explicite. | **Rang explicite** décidé par le builder (section 2), résolution en départage, `validity_bbox` pour amputer une emprise. L'ancienneté n'est pas un critère en soi : des constantes harmoniques ne vieillissent pas, un modèle sans validation locale si. |
| **Raccord aux frontières** | Bascule brute d'un atlas à l'autre ; deux atlas cohérents (BSH 90 m et 926 m) donnent des écarts de 10 à 20 % à la frontière, deux atlas incohérents (ATLNE et BSH) donnent un saut. | Accepter le saut tant que la frontière est en eau libre ; fusionner les emprises d'une même source hors ligne (les quatre tronçons Elbe en un atlas) ; envisager plus tard une pondération sur 1 km au runtime, hors format. |
| **RAM et disque sur le Space** | Lecture par tuile, LRU 128 : la RAM ne dépend pas de la taille totale. Le disque, si. `coverage_cells()` ouvre un footer par tuile au démarrage (2,4 s mesurées sur ATLNE). | Mettre les atlas CC BY dans un dataset public séparé et ne monter que ce qui sert. Europe complète à 1 km ≈ 600 Mo, monde côtier ≈ 5 Go : le Space actuel encaisse l'Europe ; le monde demande un stockage objet ou une sélection par région (section 7 de la spec). |
| **Versioning** | `build_at`, commit du builder, sha256 des entrées, date de lecture de la licence dans `metadata.json` (spec section 8). | Un build = un répertoire immuable ; un dataset HF taggé par mois. |

## 6. Carte interactive

Deux rendus de la même donnée, générés par `scripts/build_tidal_world_map.py` :
la page méthodologie du site (`packages/web`, composant `TidalSourcesMap`,
couches statiques écrites sous `public/methodologie/tidal/` par l'option
`--web-dir`) et la page autonome `docs/tidal-world/map/index.html` (Leaflet,
`data.js`, toutes les couches de travail).

**Lecture par défaut : quatre couleurs** (demande du 2026-09-20). La carte du
site ne montre que les zones où le courant tidal maximal dépasse 1,5 kt
(masques calculés, ci-dessous) et les passes connues, colorées selon quatre
statuts calculés par `zone_status()` et `pass_status()` :

- **vert, couvert** : une source de marée à 5 km ou plus fin sert la zone
  (SHOM, MARC dans sa zone validée, atlas construits BSH et Copernicus) ;
  pour une passe, 1 km ou plus fin ;
- **orange, cible identifiée** : pas couvert, mais une source en licence
  ouverte du registre (`status: ok`, grille de modèle ou constantes
  harmoniques, résolution 5 km ou mieux, 1 km ou mieux pour une passe)
  existe à cet endroit ;
- **violet, données fermées ou à clarifier** : pas couvert, et les seules
  sources connues sont `blocked` ou `clarify` (UKHO, Puertos del Estado,
  SSW-RS, Rijkswaterstaat) ;
- **rouge, aucune source connue** : rien dans le registre (Messine, Euripe,
  Bosphore, Dardanelles).

Les sources d'emprise mondiale (FES, TPXO) ne colorent jamais une zone :
elles sont le dernier étage de la cascade, pas une cible. Une source ouverte
sans résolution déclarée (DMI DKSS) peut colorer une zone en orange, pas une
passe. Les atlas construits mais pas encore publiés dans le dataset (BSH,
Copernicus) comptent comme couverts : leur publication fait partie de la
liste de merge, sinon la carte promet plus que le serveur.

Le registre des sources est replié sous la carte : une ligne par source
(nom, producteur, licence lue et datée, statut), une case pour dessiner son
emprise, et une dernière ligne qui ouvre un courriel à contact@ohmywind.fr
pour en proposer une. Un clic sur la mer interroge `/api/v1/marine/marc` et
affiche la source que le serveur choisirait, sa précision, le statut de la
zone et la passe connue la plus proche.

Entrées du script :

- `sources.geojson` : **le registre de référence** (44 sources, une fiche
  par source avec licence, URL, date de lecture, accès, effort, étape) ;
- `coverage_current.geojson` : SHOM C2D (boîtes des 40 cartouches), MARC
  (7 emprises, tuiles réelles coupées à la boîte de validité), atlas
  construits (`bsh/atlas`, `cmems/atlas`, couche `built`), SMOC ;
  recalculé depuis `build/` quand il est présent ;
- `mask_atlne.geojson` : **masque calculé** des zones où le courant tidal
  maximal dépasse 0,5 et 1,5 kt, par `scripts/build_tidal_world_mask.py`
  depuis ATLNE (2 km, Atlantique nord-est) ;
- `mask_fes.geojson` : le même masque, mondial, depuis l'atlas FES2014
  construit par `scripts/build_fes_atlas.py` (compte AVISO créé le
  2026-09-20, archives de courants téléchargées, 16 constituants, 1/16°) ;
- `gazetteer.geojson` : passes, raz et estuaires, avec le courant de
  vive-eau typique et le statut « source ouverte » ;
- `build/natural_earth/ne_10m_ocean.geojson` (Natural Earth 10 m, domaine
  public, téléchargé depuis le miroir `nvkelso/natural-earth-vector`, non
  versionné) : les quatre couleurs sont coupées à l'océan, parce que les
  grilles régulières MARC portent des valeurs extrapolées sur la terre et
  qu'un pixel FES de 7 km chevauche la côte. À chaque endroit, seul le
  masque de l'atlas le plus fin compte (`layered_mask`) ; les plus grossiers
  ne servent qu'en dehors de l'emprise réelle des cellules des plus fins
  (le trait `threshold_kt: 0` que le builder de masques écrit ; l'emprise en
  tuiles de 0,5° rendait le canal de Bristol « calme » parce que MANGA y a
  quelques cellules) ;
- `--shipped-from https://…hf.space` : la liste des atlas servis est lue sur
  le serveur (`/api/v1/marine/marc/coverage`), la même que la page lit au
  chargement pour badger « dans la cascade » dans le registre. Sans
  serveur, `--shipped` donne la liste à la main.

Sorties : `coverage_current.geojson`, `gaps.geojson` (gazetteer enrichi du
statut et de la meilleure source, polygones du masque sans source fine),
`status.geojson` (les quatre statuts), `data.js`. Avec `--write-gaps`, le
script réécrit aussi le cliché derrière l'avertissement `currents.tidal_gap`
(`openwind_data/currents/tidal_gaps.geojson` et sa copie
`packages/web/src/domain/tidalGaps.json`, identiques) : monde entier, masques
1,5 kt moins les sources **servies** à 1 km ou plus fin, plus les passes sans
telle source ; les atlas construits mais pas publiés n'y comptent pas tant que
`--gaps-include-built` n'est pas passé, sinon Cuxhaven perdrait son
avertissement avant que BSH n'y réponde.

**Masques « là où les courants comptent »** : reconstruction horaire sur
15 jours de chaque cellule d'un atlas, maximum, rastérisation, fermeture
morphologique, vectorisation. Le masque ATLNE est juste là où ATLNE l'est
et ne voit pas une passe plus étroite que 2 km ; le masque FES2014 couvre le
monde à 7 km et voit encore moins fin. Le gazetteer complète donc les deux
(Saltstraumen, Corryvreckan, Menai).

Le gazetteer compte 88 entrées (recherche déléguée, sources par entrée,
confiance haute pour 10 d'entre elles issues de services hydrographiques
ou de publications revues, moyenne pour 52, basse pour 26). Trois entrées
sont marquées « non tidal » (Bosphore, Dardanelles, mascaret du Qiantang)
pour ne jamais être traitées comme des raz. Aucun chiffre du gazetteer
n'est une donnée de navigation.

Piste à confirmer pour la France : si l'édition NetCDF du SHOM Courants 2D
est bien sous Licence Ouverte 2.0, le masque France se calcule directement
depuis la vitesse maximale au coefficient 95 de chaque maille, à 250 m en
Iroise, sans analyse harmonique, et remplace avantageusement le masque
ATLNE sur la façade.

## 7. Spike BSH, en bref

Détails, méthode, chiffres et limites dans [`spike-bsh.md`](spike-bsh.md).

- Source choisie : BSH, parce que c'est la seule source qui couvre l'Elbe
  à 90 m et la baie allemande à 0,5 nm **sans compte** et en CC BY 4.0 ;
  CMEMS NWS aurait donné 1,5 km avec un compte que je n'ai pas.
- Chaîne : `archive_bsh_currents.py` (FTP → archive locale + manifeste) →
  `build_bsh_atlas.py` (pour chaque instant le fichier au délai le plus
  court, analyse en flux, inférence des constituants non résolus depuis
  ATLNE, écriture au format standard) → `validate_bsh_atlas.py`.
- Résultat : 4 atlas (Elbe extérieure 90 m, Cuxhaven-Brunsbüttel 90 m,
  baie allemande intérieure et étendue 926 m), 34 Mo, construits en moins
  de 8 s chacun à partir de 3 à 5 jours d'archive.
- Validation indépendante (radar HF COSYNA, 3 ans, 6 points au large) :
  M2 de l'atlas BSH à 0 à 19° de phase des observations (moins de 40
  minutes), 1 à 21° d'inclinaison, +6 à +23 % d'amplitude ; ATLNE : −21 à
  −39 % d'amplitude, +8 à +37° de retard. Hold-out d'une journée : RMSE
  vectoriel 0,61 kt sur Cuxhaven-Brunsbüttel (skill 0,76) contre 1,07 kt
  pour ATLNE (skill 0,26) et 1,24 kt sans courant ; jusant de 4,6 kt en
  rade de Cuxhaven dans la prévision, 3,5 kt dans l'atlas, 0,9 kt dans
  ATLNE.
- Limite majeure : trois jours ne résolvent que M2, K1, M4, M6 ; S2, N2, K2
  et le reste sont inférés depuis ATLNE, donc la modulation vive-eau /
  morte-eau vient d'ATLNE. Il faut l'archive d'un mois pour S2 et N2, d'un
  an pour le reste. D'où le workflow.

## 8. Refacto du registry, décrit sans être fait

Le registry lit déjà les atlas BSH. Pour être générique, trois changements,
tous petits, aucun ne touchant les contrats MCP :

```diff
--- a/packages/data-adapters/src/openwind_data/currents/marc_atlas.py
+++ b/packages/data-adapters/src/openwind_data/currents/harmonic_atlas.py
-class AtlasMeta:
+class AtlasMeta:
     name: str
     rank: int
     resolution_m: int
+    source_short: str          # metadata["source"]["short"], "marc" par défaut
+    zone: str                  # metadata["zone"], name.lower() par défaut
+    confidence: str            # metadata["confidence"], "high" par défaut
+    validity_bbox: tuple | None  # metadata["validity_bbox"], None par défaut
+
+    @property
+    def source_label(self) -> str:
+        return f"{self.source_short}_{self.zone}_{self.resolution_m}m"

 def covers(self, lat, lon):
-    candidates = [a for a in self.atlases if _bbox_contains(a.bbox, lat, lon)]
+    candidates = [
+        a for a in self.atlases
+        if _bbox_contains(a.bbox, lat, lon)
+        and (a.validity_bbox is None or _bbox_contains(a.validity_bbox, lat, lon))
+    ]

--- a/packages/data-adapters/src/openwind_data/currents/router.py
-        source_label = _marc_source_label(atlas.name, atlas.resolution_m)
+        source_label = atlas.source_label

--- a/packages/data-adapters/src/openwind_data/currents/narrow_pass.py
-    if source.startswith("shom_c2d_") or source.startswith("marc_"):
-        return "high"
+    # la confiance vient des métadonnées de l'atlas, transmise avec le label
```

Plus un renommage `MarcAtlasRegistry` → `HarmonicAtlasRegistry` avec alias
de compatibilité, et un script de migration des sept `metadata.json` MARC
vers le schéma 3 (ajout de `source`, `zone`, `confidence`, conventions), sans
rebuild. La confiance par point demande de faire circuler `confidence` à
côté de `current_source` dans `SeaPoint`, ou de la déduire du label via une
table lue au chargement ; la seconde option ne change aucun schéma.

Ce qui ne bouge pas : `ShomC2dRegistry` (format à part, séries relatives à
la PM), `harmonic.py`, les tools MCP, l'API REST.

## 9. Roadmap

Priorité = usage réel × force du courant × disponibilité open data × 1/effort.

| Étape | Zone et source | Pourquoi | Effort | Critère de « done » | Passage-test |
|---|---|---|---|---|---|
| **1** | **Allemagne : BSH** (baie allemande 926 m, Elbe 90 m, Frise 926 m) | premier pays d'usage, courants 2 à 4 kt, source sans clé, spike validé. **Publié dans le dataset le 2026-09-20** (quatre atlas du spike, 3 à 5 jours d'archive, M2 K1 M4 M6 résolus, S2 N2 inférés d'ATLNE) : le Space dev répond `bsh_db_926m` à Helgoland et `bsh_ausalt_90m` en rade de Cuxhaven. Le critère « 29 jours » reste à atteindre par l'archivage. | S (fait) + archive | atlas ≥ 29 jours (S2, N2 résolus) dans le dataset public ; `bsh_cuxbru_90m` répond à Cuxhaven ; ATLNE amputé de la mer du Nord par `validity_bbox` ; ETA Cuxhaven → Helgoland varie de ≥ 1 h selon l'heure de départ | Cuxhaven → Helgoland (26 nm) ; Cuxhaven → Brunsbüttel (16 nm dans le chenal) |
| **2** | **Monde : FES2014 courants** (compte AVISO créé le 2026-09-20, 4,4 Go d'archives téléchargées, `scripts/build_fes_atlas.py`) | remplace SMOC 8 km météo-dépendant par un vrai atlas tidal mondial ; débloque le masque mondial | M (atlas et masque construits en local) | atlas mondial 1/16° dans le dataset public, rang 0 ; ATLNE ne sert plus qu'en Atlantique | Cherbourg → Alderney (raz Blanchard, comparaison SHOM) ; Cook Strait NZ (sanity) |
| **3** | **UK, Irlande, mer du Nord, Manche : CMEMS NWS 1,5 km** (compte Copernicus créé le 2026-09-20, `scripts/build_cmems_atlas.py`). **Publié dans le dataset le 2026-09-20 au soir**, avec IBI et MED. | deuxième bassin d'usage probable ; Solent, Portland, Douvres, Pentland, Irlande à 1,5 km ; couvre aussi les Pays-Bas et le Danemark | M (un an d'archive horaire = 37 Go pour le domaine entier, 3 Go par mois ; un an de baie allemande analysé et validé contre le radar, voir `spike-cmems.md`) | atlas NWS rang 0 (un atlas MARC ou BSH gagne toujours dessus) ; masque Europe recalculé dessus | Cowes → Cherbourg ; Ramsgate → Dunkerque ; Dun Laoghaire → Holyhead |
| **3b** | **Ibérie, Maroc, Canaries : CMEMS IBI 3 km ; Méditerranée jusqu'à Israël : CMEMS MED 4,2 km** (même compte) | ferme la zone objectif au sud et à l'est ; la Méditerranée ne garde que les cellules où la marée dépasse 0,2 kt (Gibraltar, Messine à la maille près, Venise) | M (même chaîne, 47 + 28 Go d'archive) | atlas IBI et MED rang 0 ; Gibraltar répond `cmems_ibi_*` | Tarifa → Ceuta ; Marseille → Porquerolles (doit rester sur SMOC ou vide, marée négligeable) |
| **4** | **Norvège : NorKyst800** ; **Danemark : DMI DKSS** | courants forts localisés (Lofoten), source sans clé | M | atlas 800 m rang 1 ; Saltstraumen documenté comme non résolu (gazetteer) | Bodø → Lofoten ; Skagen → Göteborg |
| **5** | **Amérique du Nord : NOAA OFS + ECCC CIOPS** | domaine public, S3 sans clé, archive depuis 2022 ; Salish Sea 500 m | M par système | atlas par système, rang 2 ; harcon NOAA en points de contrôle | Seattle → Victoria (Salish) ; Annapolis → Norfolk (Chesapeake) |
| **6** | Australie : AusTEN (CC BY-SA, à arbitrer) et eReefs | seul atlas de constituants de courant ouvert hors Europe | M | décision licence prise ; atlas rang 1 | Sydney → Newcastle ; Banks Strait |
| **7** | Corée (KHOA), Écosse fine (SSW-RS), Pays-Bas (RWS) | licences OK mais accès ou volume lourds | L | | |

Trous sans source ouverte, à afficher tels quels dans la carte (couche
« Trous ») : détroit de Messine, Euripe, Gibraltar fin (Puertos bloqué,
CMEMS IBI à 2,5 km seulement), Solent/Portland/Bristol/Tamise/Menai/
Strangford plus fins que 1,5 km (UKHO seul), île de Man et Anglo-Normandes
côté UK, Nouvelle-Zélande, Japon, Chili, Afrique du Sud, Chine. Partiels :
Pentland Firth et Corryvreckan (NWS 1,5 km, SSW-RS lourd), Saltstraumen
(NorKyst 800 m), Wadden néerlandais (BSH couvre la Frise orientale, pas
Texel ni Vlie).

## 10. Archivage des séries (bonus)

`.github/workflows/archive-bsh-currents.yml`, désactivé par `if: false`.
Deux runs par jour à 04:30 et 16:30 UTC, `archive_bsh_currents.py` en
sparse checkout, dépôt dans un HF Dataset public nommé par la variable
`HF_ARCHIVE_DATASET` avec un `HF_TOKEN` en écriture sur ce seul dataset.
Volume mesuré sur le FTP le 2026-09-19 : 55 Mo/jour pour les huit zones
allemandes (22 Mo/jour une fois dédoublonné par le builder), soit 8 Go/an
brut ; 3 minutes de runner par run. Rien n'est écrit dans le dataset privé
MARC. À activer seulement après décision sur le dataset de destination.

Le même schéma vaut pour DMI (48 h de rétention) et pour CIOPS (30 jours) ;
CMEMS et NOAA n'en ont pas besoin (archives en ligne).

## 11. Recommandations

À faire ensuite, dans l'ordre, trois PR maximum :

1. **PR « registry générique + ATLNE amputé »** : les trois changements de
   la section 8, migration des `metadata.json` MARC, `validity_bbox` sur
   ATLNE excluant la mer du Nord (au nord de 51 N et à l'est de 3 E), tests
   de non-régression sur les points français. Sans nouvel atlas, cette PR
   fait déjà passer l'Elbe de « faux avec confiance haute » à « SMOC avec
   confiance moyenne », ce qui est honnête.
2. **PR « Allemagne par BSH »** : activer le workflow d'archivage vers un
   dataset public, attendre 29 jours, rebâtir les atlas avec S2 et N2
   résolus, les publier, les monter dans le Space, brancher le label
   `bsh_*` dans la légende web. Passage-test Cuxhaven → Helgoland avec
   comparaison à la table BSH.
3. **PR « fallback mondial FES2014 »** : demander le compte AVISO+,
   builder `build_fes_atlas.py` (constantes déjà harmoniques, seulement un
   regrid et un mapping de noms), rang 0 mondial, masque mondial pour la
   carte. Ou, si le compte tarde, la variante SMOC `utide/vtide`.

À vérifier en marge, sans PR dédiée : la licence de l'édition SHOM
Courants 2D effectivement utilisée par `build_shom_c2d.py`. Si c'est la
Licence Ouverte 2.0 comme sur data.gouv.fr, les artefacts C2D peuvent
rejoindre le dataset public et le masque France peut en être dérivé.

Ce que je déconseille :

- **Ne pas** chercher à réutiliser `utide` ou `pytides` pour l'analyse :
  la convention V0 diffère de celle du prédicteur, et le module maison
  garantit l'aller-retour exact (test).
- **Ne pas** construire d'atlas harmonique en Baltique ni en Méditerranée :
  la marée y est négligeable, le signal est météo, le format n'apporte
  rien.
- **Ne pas** publier d'atlas dérivé de Puertos del Estado, de TPXO, de
  WebTide ni de FES2022, quelle que soit la facilité d'accès technique.
- **Ne pas** interpoler bilinéairement au runtime pour « lisser » les
  frontières entre atlas : la valeur ajoutée est nulle face à l'erreur de
  modèle, et cela coûterait quatre lectures de tuile par point.
- **Ne pas** activer le workflow d'archivage sans avoir choisi le dataset
  de destination et vérifié qu'il est bien public et distinct du dataset
  MARC.

## Annexe : vérifié / supposé

Vérifié (fichier, page ou mesure, date) : couverture ATLNE en mer du Nord
et valeurs prédites (mesure locale, 2026-09-19) ; structure des GRIB2 BSH
(eccodes, 2026-09-19) ; licence BSH (LICENSE.txt du FTP, README, fiche
GDI-DE) ; licence AVISO Issue 20 (PDF) ; licence Copernicus Marine (page) ;
NorKyst800 (fiche ADC, catalogue THREDDS) ; Marine Institute (fiche
geonetwork) ; COSYNA (attributs ERDDAP) ; Pegelonline (Nutzungsbedingungen) ;
DL-DE-BY-2.0 (GovData) ; TPXO (page inscription) ; EOT20 (SEANOE) ; les
sources hors Europe listées avec URL dans 3.2 ; résultats de validation
(`build/bsh/validation/report.json`, reproductible par
`scripts/validate_bsh_atlas.py`).

Supposé ou non confirmé : résolution DKSS ; open data SMHI/FMI pour les
courants ; pas de temps Marine Institute ; format WebTide ; licence NOC
Atlas of Tides ; licence AIMS eReefs ; les courants publiés dans la
littérature à Cuxhaven (3,5 kt au flot devant Scharhörn, 5 kt par vent
d'ouest, forum et cuxpedia, à confirmer par les tables BSH) ; le volume
exact des archives CMEMS et NOAA.
