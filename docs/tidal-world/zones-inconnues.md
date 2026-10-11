# Zones où le courant est inconnu

Rédigé le 2026-10-11, à la suite de la revue du chantier des courants de marée.

## La règle

Un chiffre faux avec une étiquette de confiance est pire qu'une absence de chiffre. Le moteur, l'API et le web **retirent** donc le courant (et, si la zone le dit, la hauteur d'eau) dans deux cas :

1. **Une zone documentée** de `packages/data-adapters/src/openwind_data/currents/unknown_zones.geojson`, où aucune source servie ne décrit le courant réel.
2. **À moins de 3 km d'une passe connue que la source ne voit pas** (`tidal_gaps.geojson`) : une grille fine que le constructeur de la carte a mesurée aveugle (`unresolved_by`), ou toute source grossière (plus de 1 km, SMOC) devant une passe de la liste, puisque la liste ne contient que les passes qu'aucune source fine ne sert.

Effet, partout le même :

- **Moteur** : `current_source: "unknown"`, vitesse et direction `None`, confiance `None`. Le tronçon va à la vitesse du bateau, et la notice `currents.unknown` nomme les endroits une fois par passage.
- **Cascade** (`CompositeMarineAdapter`, donc `get_marine_forecast` et le chemin REST en direct) : dans une zone documentée, les séries listées reviennent `None`.
- **API d'overlay** : `{"covered": false, "unknown": {"zone", "reason", "fields"}}`, pour que le client ne retombe pas sur sa base SMOC.
- **Web** : l'Explorer masque les valeurs et explique pourquoi sous le tableau des courants, et la fiche de tronçon affiche « inconnu ». Le web embarque une copie identique du fichier de zones, et un test serveur garde les deux égales.

Une zone ne corrige aucune valeur : elle la retire et cite pourquoi. C'est la différence avec les boîtes de passes dessinées à la main que `narrow_pass` a abandonnées en 2026-09, qui dégradaient une confiance par intuition.

Le seuil de 15 km de `currents.tidal_gap` ne change pas. Entre 3 et 15 km d'une passe, la valeur reste affichée avec l'avertissement « probablement trop faible ».

## Format d'une zone

Chaque entité du GeoJSON porte :

| Champ | Contenu |
|---|---|
| `id` | identifiant court, unique |
| `name` | le nom cité dans les notices, tel qu'un navigateur le dirait |
| `reason` | `managed` (un ouvrage règle le courant), `unresolved` (chenal plus étroit que toute grille servie), `non_tidal` (débit, vent) |
| `fields` | ce qui est retiré : `current`, `tide` |
| `source` | la citation qui justifie la zone ; sans elle, pas de zone |
| `added` | date d'ajout |

## Zones en place

| Zone | Raison | Retiré | Justification |
|---|---|---|---|
| Rance, en amont de l'usine marémotrice | `managed` | courant, hauteur | Contour tracé d'après les cellules mortes de MANW, dilatées de 300 à 500 m, puis le fleuve jusqu'à l'écluse du Châtelier. Le bassin est exploité par les vannes et turbines d'EDF. MARC MANW 250 m y lit une eau morte (M2 nulle de 48,539 à 48,615 N), MARC MANGA 700 m une marée libre. Vérifié sur l'API dev le 2026-10-11 : `covered: true`, hauteur et courant à 0 vers La Richardais, marée de ±2 m à 0,1 kt plus en amont. |

## Candidats, à documenter avant d'entrer

Le scan `scripts/scan_dead_cells.py build/marc` liste les grappes de cellules où l'amplitude M2 de hauteur est quasi nulle dans un atlas de côte à marée : de l'eau que le modèle a coupée de la marée, ou de la terre remplie de zéros. Le scan ne fait que proposer. Une cellule morte n'est pas une règle générique : dans la Baltique, une marée quasi nulle est physique et le courant faible est la bonne réponse.

| Atlas | Grappe (lat, lon) | Cellules | Hypothèse à vérifier |
|---|---|---|---|
| MANW | 48,586, −2,174 | 16 | estuaire de l'Arguenon |
| MANW | 49,016, −1,564 | 28 | havre de Regnéville (Sienne) |
| MANW | 48,637, −1,364 | 11 | estuaire de la Sélune |
| AQUI | 46,323, −1,297 | 23 | estuaire du Lay |
| MANE, MANGA | 49,3 à 49,55, 0,45 à 1,15 | plusieurs milliers | vallée de la Seine en aval de Rouen : peut-être de la terre remplie de zéros, peut-être la Seine maritime, où le courant est réel et que MARC lit nul |

Autres pistes, sans signal dans les atlas : les détroits où le vent domine (Bonifacio), les estuaires dominés par le débit en crue (Loire, Gironde), les ports à écluse.

## Ajouter une zone

1. Ouvrir une issue avec le formulaire « Zone où le courant n'est pas la marée » : lieu, emprise, raison, champs, **source**.
2. La zone entre dans `unknown_zones.geojson`, puis dans sa copie web `packages/web/src/domain/unknownZones.json` (`test_the_web_bundles_the_same_file` échoue sinon).
3. Un test de position dans `tests/currents/test_unknown_zones.py`, un point dedans et un point dehors.

Pas de régénération de carte ni de redéploiement du jeu de données : le fichier est dans le code, la zone part au déploiement suivant.
