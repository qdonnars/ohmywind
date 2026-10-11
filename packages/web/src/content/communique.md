## Une question simple : quand partir ?

Les applications de navigation font souvent beaucoup de choses, et coûtent cher pour des besoins qui restent simples. OhMyWind part d'un constat de terrain : pour une sortie à la journée ou une petite traversée, le plaisancier n'a pas besoin d'un routage complet, il a besoin de savoir quelle fenêtre de départ est la bonne.

L'utilisateur [trace sa route](/plan), choisit un type de bateau, et OhMyWind calcule pour chaque heure de départ possible :

- la durée et l'heure d'arrivée, étape par étape, à partir des polaires du bateau ;
- le vent, la mer et le courant rencontrés sur chaque tronçon ;
- un score de complexité de 1 à 5, avec des alertes concrètes (vent soutenu, mer formée, vent contre courant).

Les fenêtres se comparent d'un coup d'œil, et plusieurs tracés peuvent être [mis côte à côte](/comparer).

## Les courants de marée, pris au sérieux

Le calcul des courants de marée couvre une grande partie des eaux européennes : Manche, golfe de Gascogne, mer du Nord, baie allemande et Elbe. À chaque endroit, OhMyWind utilise l'atlas de marée le plus précis disponible, issu de producteurs publics (SHOM, Ifremer, BSH, Copernicus). Ces données ont été comparées à des mesures réelles de radars côtiers.

Là où aucune source fiable n'existe, par exemple dans certains passages étroits que les modèles ne résolvent pas, l'application affiche « courant inconnu » plutôt qu'un chiffre trompeur. Une [carte de couverture](/methodologie/courants), consultable sur le site, indique point par point quelle source est utilisée.

## Les meilleurs modèles météo publics, au choix de l'utilisateur

OhMyWind agrège les modèles météorologiques publics de référence : AROME de Météo-France (maille de 1,3 km), ICON-EU, ECMWF et GFS. L'utilisateur choisit le modèle ou laisse l'outil retenir le plus précis disponible pour sa zone. Sources, calculs et limites sont détaillés dans la [méthodologie](/methodologie).

## Disponible partout, et même dans les assistants IA

- Sur le web, sans installation : [ohmywind.fr](/)
- Sur Android, via le [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- En cinq langues : français, anglais, allemand, espagnol et italien
- Dans les assistants d'intelligence artificielle (Claude, ChatGPT, Le Chat…) grâce au protocole ouvert [MCP](https://modelcontextprotocol.io) : il suffit de décrire sa navigation en langage naturel pour obtenir une comparaison des fenêtres de départ. La connexion prend une minute, sans compte OhMyWind ni clé d'API : il suffit de suivre le [tutoriel pas à pas](https://mcp.ohmywind.fr) avec l'adresse `https://mcp.ohmywind.fr/mcp`.

## Un projet ouvert, porté par une association

OhMyWind est développé par Quentin Donnars, ingénieur Arts et Métiers, data scientist et moniteur de voile. Le projet est porté par Libramer, association loi 1901 dont la vocation est de rendre les données publiques utiles aux marins, et à terme de construire une base coopérative de courants de marée.

Le [code source est public](https://github.com/qdonnars/ohmywind) ([licence AGPL](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). Le modèle de financement repose sur le parrainage par des marques du nautisme, sans aucune influence sur les calculs ni sur les recommandations de l'outil.

> « Les données météo et océanographiques publiques sont d'une qualité remarquable, mais elles restent difficiles d'accès pour le plaisancier. OhMyWind les met au service d'une question très concrète : à quelle heure partir pour que la navigation se passe bien. »
>
> Quentin Donnars, fondateur d'OhMyWind

## Ce qu'OhMyWind n'est pas

OhMyWind est un outil d'aide à la décision. Il ne remplace ni le bulletin météo marine officiel, ni les cartes marines à jour, ni le jugement du skipper, qui reste seul responsable de sa navigation.

## Ils en ont parlé

[Bateaux.com](https://www.bateaux.com/article/52477/ohmywind-le-projet-open-source-qui-veut-repenser-la-preparation-d-une-navigation) (et ses éditions anglaise, allemande, espagnole et italienne), [BOOTE](https://www.boote-magazin.de/ausruestung/technik/ohmywind-wetterrouting-open-source/), YACHT. Tous les articles sont réunis dans la [revue de presse](/presse).

## Contact presse

Quentin Donnars, fondateur : [contact@ohmywind.fr](mailto:contact@ohmywind.fr)

Visuels (logo, captures d'écran) disponibles sur simple demande.

## Liens utiles

- **Application web** : [ohmywind.fr](/)
- **Planifier une navigation** : [ohmywind.fr/plan](/plan)
- **Comparer des tracés** : [ohmywind.fr/comparer](/comparer)
- **Android** : [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Méthodologie** : [ohmywind.fr/methodologie](/methodologie)
- **Carte des courants de marée** : [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **Serveur MCP** : `https://mcp.ohmywind.fr/mcp`
- **Tutoriel MCP (Claude, ChatGPT, Le Chat) et vidéo de démonstration** : [mcp.ohmywind.fr](https://mcp.ohmywind.fr) (en anglais)
- **Autres clients MCP (Cursor, VS Code, Goose…)** : [guide de démarrage](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds) (en anglais)
- **Protocole MCP** : [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Code source** : [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Revue de presse** : [ohmywind.fr/presse](/presse)
- **Confidentialité** : [ohmywind.fr/confidentialite](/confidentialite)
- **Association** : Libramer, association loi 1901
