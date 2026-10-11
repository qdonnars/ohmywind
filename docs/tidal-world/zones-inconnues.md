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
| Seine maritime, du pont de Normandie à Rouen | `unresolved` | courant | MARC MANE ne résout pas le chenal : pour 7,6 m de marnage, 0,04 kt de courant de vives-eaux à l'aval de Tancarville, 1,42 kt à Tancarville, 0,2 kt vers Villequier, puis une eau morte de Caudebec à Rouen. Une marée de 7 m ne se propage pas sans courant dans un fleuve chenalisé. Corridor tracé le long du fleuve, méandres compris. |

## Eau morte d'un atlas côtier (règle générique)

Le scan `scripts/scan_dead_cells.py build/marc` montrait des grappes de cellules mortes dans les atlas côtiers MARC (rang 2) : de l'eau que le modèle a coupée de la marée. Depuis le 2026-10-11, une règle générique les traite, sans qu'il faille les lister une à une.

- **La règle.** Dans un atlas côtier (rang 2 ou plus), une cellule dont le courant M2 est sous 1 cm/s (0,02 kt), ou dont la hauteur M2 est sous 5 cm, est morte. Ces seuils vivent dans `serving_policy.py`.
- **Le traitement.**
  1. Si la cellule de courant la plus proche est morte, la cascade cherche une cellule vivante à trois mailles au plus. C'est le cas de la frange côté terre du maillage, où un point de mer a une cellule vivante à 250 m.
  2. À défaut, le courant est retiré : `current_source: "unknown"`, notice `currents.unknown_water` dans le moteur, `unknown` avec la raison `model_edge` dans l'overlay. Une hauteur morte est retirée aussi.
- **Pourquoi pas dans les atlas de large.** Dans la Baltique, une marée quasi nulle est physique. La règle des 0,2 kt confie déjà ces eaux au modèle global.
- **Le cas d'école.** La Seine en amont de Tancarville. MARC MANE y lit 0 kt et 0 m de marnage à Rouen, et le servait avec une confiance haute ; à Caudebec, faute de constantes de courant, la cascade gardait la valeur SMOC sous l'étiquette de MANE.
- **Mesuré sur 5 054 points de mer** des atlas côtiers, de la Manche au Pays basque : 62 sont déclarés morts, presque tous des points de plage ou d'île que le masque de terre à 1 km laisse en mer.

La Rance garde sa zone documentée : MANGA (rang 1) y répond une marée libre, que la règle des cellules mortes ne voit pas.

Autres pistes, sans signal dans les atlas : les détroits où le vent domine (Bonifacio), les estuaires dominés par le débit en crue (Loire, Gironde). Ils entreront comme zones documentées, chacun avec sa source.

## Ajouter une zone

1. Ouvrir une issue avec le formulaire « Zone où le courant n'est pas la marée » : lieu, emprise, raison, champs, **source**.
2. La zone entre dans `unknown_zones.geojson`, puis dans sa copie web `packages/web/src/domain/unknownZones.json` (`test_the_web_bundles_the_same_file` échoue sinon).
3. Un test de position dans `tests/currents/test_unknown_zones.py`, un point dedans et un point dehors.

Pas de régénération de carte ni de redéploiement du jeu de données : le fichier est dans le code, la zone part au déploiement suivant.
