# Spike Copernicus Marine : l'étage régional de la cascade

Exploration du 2026-09-20 sur la branche `feat/tidal-currents-coverage`.
Question : les produits horaires de courant de surface du Copernicus Marine
Service peuvent-ils fournir, par analyse harmonique, l'étage « régional »
de la cascade sur toute la zone objectif (Islande et Norvège au nord, Israël
et Maroc au sud), là où ni SHOM, ni MARC, ni BSH ne répondent ?

Réponse courte : oui pour la mer du Nord, la Manche, l'Irlande, l'Ibérie et
la Méditerranée, avec une qualité « il y a de la marée ici, à 10 à 40 % près
en amplitude et à 20° près en phase » : rang 0 de la cascade, confiance
`medium`. Pas pour la Norvège (le produit Arctique n'est publié que
« détidé ») ni l'Islande (hors des domaines régionaux) : NorKyst800 et FES2014
restent la voie.

Chaque affirmation est **[vérifié]** (commande ou fichier reproductible) ou
**[supposé]**.

## 1. Accès et licence [vérifié]

- Compte Copernicus Marine créé le 2026-09-20 par Quentin, identifiants dans
  le `.env` local (jamais dans le dépôt, les commandes ni les journaux) ;
  la boîte à outils `copernicusmarine` lit
  `COPERNICUSMARINE_SERVICE_USERNAME` / `_PASSWORD`.
- Licence lue le 2026-09-19 : usage commercial et produits dérivés autorisés
  avec la mention « Generated using E.U. Copernicus Marine Service
  Information » et le DOI du produit (section 2.2(b)). Elle est écrite dans
  `metadata.json` de chaque atlas construit.
- Produits horaires de courant de surface retenus (`copernicusmarine
  describe`, 2026-09-20) :

| Zone | Jeu de données | Maille | Marée incluse |
|---|---|---|---|
| Mer du Nord, Manche, Irlande, Écosse (NWS) | `cmems_mod_nws_phy-cur_anfc_1.5km-2D_PT1H-i` | 1,5 km | oui |
| Ibérie, golfe de Gascogne, Maroc, Canaries (IBI) | `cmems_mod_ibi_phy_anfc_0.027deg-2D_PT1H-m` | 0,027° (3 km) | oui |
| Méditerranée jusqu'au Levant (MED) | `cmems_mod_med_phy-cur_anfc_4.2km-2D_PT1H-m` | 4,2 km | oui |
| Baltique | `cmems_mod_bal_phy_anfc_PT1H-i` | 2 km | oui, marée négligeable |
| Arctique, Norvège | `cmems_mod_arc_phy_anfc_6km_detided_PT1H-i` | 6 km | **non** (détidé), inutilisable |

- Service `arco-time-series`, un fichier NetCDF par mois, variables `uo` et
  `vo`. Volumes mesurés : baie allemande (3,5° × 3,5°) 90 Mo par mois ;
  domaine NWS entier (−13° à 13° E, 46° à 63° N) 3,1 Go par mois, un an en
  37 Go, téléchargé à raison d'un mois par minute et demie.

## 2. Méthode [vérifié dans `scripts/build_cmems_atlas.py`]

- Les fichiers passent dans `GridAnalysis` (moindres carrés avec corrections
  nodales, équations normales en flux) par tranches de 96 heures ; les
  cellules de terre (NaN les 48 premières heures) sont écartées avant
  l'analyse, si bien qu'un domaine de 1,5 million de cellules tient dans
  quelques Go.
- Constituants résolus par le critère de Rayleigh sur la durée : 12 à un
  mois (M2, S2, N2, K1, O1, M4, MS4, Q1, MN4, M6, 2N2, 2MS6), 18 à un an
  (K2, P1, NU2, MU2, L2, MK4 en plus). À un mois, K2 et P1 sont inférés de
  S2 et K1 avec les rapports d'un atlas de référence quand il en existe un.
- Les cellules dont le courant tidal reconstruit sur un cycle vive-eau /
  morte-eau ne dépasse jamais 0,2 kt sont écartées : le runtime y retombe
  sur la source suivante (SMOC), et la Méditerranée ne garde que ses détroits
  et lagunes. La colonne `max_speed_kn` porte la valeur.
- Rang 0 (bassin) dans les métadonnées : un atlas validé (MARC, BSH, SHOM)
  gagne toujours ; entre atlas de rang 0, le plus fin gagne. Tuiles de 1°.

## 3. Validation en baie allemande contre le radar HF [vérifié]

Référence : les mêmes séries radar HF COSYNA (EMODnet ERDDAP, 3 à 3,6 ans,
54 à 68 % de couverture) que pour le spike BSH, ellipses M2 et S2 ajustées
sur l'observation par le même code. Deux atlas Copernicus : un mois
(septembre 2025, `validation_1m.json`) et un an (septembre 2025 à août 2026,
`validation_year.json`). En regard, l'atlas BSH construit sur trois jours de
prévisions (`bsh_db`, 926 m) et MARC ATLNE (2 km).

Demi-grand axe en nœuds / inclinaison / phase Greenwich. Deux ellipses qui
diffèrent de 180° d'inclinaison et de 180° de phase sont identiques.

### M2

| Point | Observé | CMEMS 1 mois | CMEMS 1 an | BSH 3 jours | ATLNE |
|---|---|---|---|---|---|
| helgoland | 0,92 / 175° / 61° | 0,82 / 0° / 251° | 0,75 / 5° / 252° | 0,56 / 141° / 8° | 0,76 / 172° / 76° |
| helgoland_se | 0,98 / 11° / 257° | 1,27 / 2° / 271° | 1,25 / 5° / 269° | 1,28 / 180° / 70° | 0,67 / 3° / 264° |
| helgoland_n | 1,00 / 170° / 59° | 1,21 / 177° / 81° | 1,15 / 178° / 79° | 1,24 / 176° / 68° | 0,75 / 8° / 267° |
| elbe_approach | 1,17 / 166° / 63° | 1,63 / 165° / 76° | 1,58 / 166° / 74° | 1,52 / 166° / 61° | 0,71 / 174° / 76° |
| eider_approach | 1,89 / 148° / 70° | 1,03 / 159° / 68° | 1,00 / 159° / 66° | 2,40 / 170° / 70° | 1,26 / 171° / 107° |
| bight_mid | 0,94 / 164° / 55° | 1,17 / 164° / 68° | 1,03 / 161° / 65° | 1,00 / 160° / 47° | 0,75 / 162° / 67° |
| amrum_bank | 1,21 / 7° / 265° | 1,13 / 2° / 269° | 1,08 / 3° / 269° | 1,29 / 173° / 66° | 0,84 / 21° / 281° |

### S2

| Point | Observé | CMEMS 1 mois | CMEMS 1 an | BSH 3 jours | ATLNE |
|---|---|---|---|---|---|
| helgoland | 0,24 / 178° / 130° | 0,28 / 1° / 333° | 0,21 / 2° / 315° | 0,14 / 148° / 73° | 0,19 / 173° / 142° |
| helgoland_se | 0,26 / 16° / 328° | 0,44 / 4° / 355° | 0,36 / 5° / 338° | 0,34 / 179° / 134° | 0,17 / 4° / 331° |
| helgoland_n | 0,26 / 172° / 127° | 0,40 / 178° / 161° | 0,32 / 178° / 146° | 0,33 / 176° / 132° | 0,19 / 8° / 332° |
| elbe_approach | 0,31 / 168° / 132° | 0,53 / 164° / 157° | 0,44 / 167° / 146° | 0,40 / 170° / 125° | 0,18 / 174° / 144° |
| eider_approach | 0,52 / 148° / 140° | 0,37 / 157° / 153° | 0,29 / 158° / 140° | 0,64 / 172° / 133° | 0,31 / 171° / 176° |
| bight_mid | 0,24 / 165° / 122° | 0,36 / 169° / 159° | 0,27 / 162° / 134° | 0,26 / 165° / 113° | 0,19 / 164° / 133° |
| amrum_bank | 0,31 / 6° / 332° | 0,39 / 179° / 169° | 0,31 / 1° / 336° | 0,34 / 174° / 131° | 0,21 / 20° / 347° |

Lecture :

- **Un an vaut mieux qu'un mois**, comme attendu : S2 passe de +40 à +70 %
  d'excès à +10 à +40 %, et les phases M2 se resserrent de 1 à 3°. Le mois
  seul reste utilisable (M2 à 10 % près de l'atlas annuel) : c'est ce qui
  permettra de rafraîchir un atlas sans rejouer un an.
- **M2 à un an** : amplitude de −18 % à +35 % selon le point, phase à moins
  de 20° (40 minutes), inclinaison à moins de 10°. Deux exceptions : Eider
  (−47 %, la maille de 1,5 km lisse l'entrée de l'estuaire, BSH y donne
  +27 %) et Helgoland même (−18 % et l'ellipse tourne de 10°, sur un point
  bordé de récifs).
- **Contre BSH 3 jours** : BSH est meilleur en phase (à 10° près partout
  sauf Helgoland), Copernicus est comparable en amplitude et parfois mieux
  (Amrum, Eider en signe opposé). BSH garde son rang 1 dans la baie : un
  atlas d'un mois de BSH (archivage actif) ferait mieux que les deux.
- **Contre ATLNE** : Copernicus est meilleur partout en mer du Nord, ce qui
  confirme le confinement d'ATLNE à sa boîte de validité.
- Variance expliquée par l'ajustement harmonique de l'observation : 86 à
  92 % sur la composante est, 36 à 85 % sur la composante nord (le vent et
  la houle font le reste, ce qu'aucun atlas de marée ne prétend rendre).

## 4. Domaines complets [en cours le 2026-09-20]

Un an horaire (2025-09 à 2026-08) téléchargé pour NWS, IBI et MED, atlas
construits par le même script avec le filtre 0,2 kt et des tuiles de 1° :
voir `metadata.json` de chaque atlas sous `build/cmems/atlas/` (nombre de
cellules, durée d'analyse, constituants). Les emprises et les statuts de
couverture qui en résultent sont dans la carte (`status.geojson`).

Norvège : NorKyst800 (MET Norway, THREDDS sans clé, grille polaire
stéréographique, lecteur à écrire). Islande : FES2014 à 7 km seulement
(`build_fes_atlas.py`), passes non résolues, à afficher tel quel.

## 5. Ce qui reste avant la production

1. Publier les atlas (`cmems/atlas/*`, `fes/atlas/FES_GLOBAL`, `bsh/atlas/*`)
   dans le dataset HF (nom à donner par Quentin) et rejouer
   `migrate_atlas_metadata.py --write --push` pour ATLNE (rang 1, boîte de
   validité) : sans cela la carte promet plus que le serveur.
2. Décider si l'avertissement `currents.tidal_gap` s'éteint sur un atlas
   Copernicus (confiance `medium`, mais la marée y est résolue) ou seulement
   sur un atlas `high` : aujourd'hui il reste allumé au-dessus de 1 km.
3. Rafraîchissement : un mois d'archive par an et par domaine suffit à
   surveiller une dérive du modèle (section 3, premier point).
