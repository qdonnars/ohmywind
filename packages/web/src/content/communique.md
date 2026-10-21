## Nouveau : une conversation de marin avec les assistants IA

OhMyWind se branche sur les assistants d'intelligence artificielle (Claude, ChatGPT, Le Chat…) grâce au protocole ouvert [MCP](https://modelcontextprotocol.io). Le plaisancier décrit sa sortie comme il le ferait à un équipier, « demain, Marseille vers Porquerolles sur un Sun Odyssey 36, je pars quand ? », et l'assistant interroge OhMyWind pour lui répondre. La version 1.10, publiée le 17 octobre 2026, en fait un véritable outil de bord :

- **Un trajet en une seule vue** : la liste des départs possibles en tête, puis la route sur une carte et le détail tronçon par tronçon du départ choisi, affichés dans la conversation sur les assistants qui le permettent, comme Claude et ChatGPT. Ailleurs, un lien ouvre le même plan sur ohmywind.fr.
- **Les questions de marée, sans calculer de trajet** : l'heure de l'étale à l'entrée d'une passe, la force et le sens du courant, les pleines et basses mers, le coefficient.
- **Deux options comparées en une seule demande** : par le nord ou par le sud d'une île, vers l'une ou l'autre destination, départ par départ.
- **Des réponses à l'heure du bord** : données dans l'heure locale du plaisancier, avec le jour de la semaine, plus courtes et donc plus rapides.
- **Une route qui coupe la terre est refusée** avant tout calcul, et l'assistant est invité à la redessiner en mer.

La connexion prend une minute, sans compte OhMyWind ni clé d'API : il suffit de suivre le [tutoriel pas à pas](https://mcp.ohmywind.fr) avec l'adresse `https://mcp.ohmywind.fr/mcp`. Le détail des nouveautés est dans le [journal des versions](/a-propos/nouveautes).

## Le juste besoin : quand partir, par où passer

Les applications de navigation font souvent beaucoup de choses, et coûtent cher pour des besoins qui restent simples. OhMyWind se concentre sur le juste besoin : pas un logiciel de routage de plus, mais des réponses aux questions que se pose le plaisancier avant une sortie à la journée ou une petite traversée. À quelle heure partir ? Par où passer ?

L'utilisateur [trace sa route](/plan), choisit un type de bateau, et OhMyWind calcule pour chaque heure de départ possible :

- la durée et l'heure d'arrivée, étape par étape, à partir des polaires du bateau ;
- le vent, la mer et le courant rencontrés sur chaque tronçon ;
- un score de complexité de 1 à 5, avec des alertes concrètes (vent soutenu, mer formée, vent contre courant).

Les fenêtres se comparent d'un coup d'œil, tout comme plusieurs itinéraires pour une même traversée. La page [Comparer](/comparer) met aussi les spots favoris côte à côte, heure par heure.

## Les courants de marée, pris au sérieux

Le calcul des courants de marée couvre une grande partie des eaux européennes : Manche, golfe de Gascogne, mer du Nord, baie allemande et Elbe. À chaque endroit, OhMyWind utilise l'atlas de marée le plus précis disponible, issu de producteurs publics (SHOM, Ifremer, BSH, Copernicus). Ces données ont été comparées à des mesures réelles de radars côtiers.

Là où aucune source fiable n'existe, par exemple dans certains passages étroits que les modèles ne résolvent pas, l'application affiche « courant inconnu » plutôt qu'un chiffre trompeur. Une [carte de couverture](/methodologie/courants), consultable sur le site, indique point par point quelle source est utilisée.

## Les meilleurs modèles météo publics, au choix de l'utilisateur

OhMyWind agrège les modèles météorologiques publics de référence : AROME de Météo-France (maille de 1,3 km), ICON-EU, ECMWF et GFS. L'utilisateur choisit le modèle ou laisse l'outil retenir le plus précis disponible pour sa zone. Sources, calculs et limites sont détaillés dans la [méthodologie](/methodologie).

## Disponible partout

- Sur le web, sans installation : [ohmywind.fr](/)
- Sur Android, via le [Google Play Store](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- En cinq langues : français, anglais, allemand, espagnol et italien
- Dans les assistants d'intelligence artificielle compatibles MCP, comme Claude, ChatGPT ou Le Chat

## Un projet ouvert, porté par une association

OhMyWind est développé par Quentin Donnars, ingénieur Arts et Métiers, data scientist et moniteur de voile. Le projet est porté par Libramer, association loi 1901 dont la vocation est de rendre les données publiques utiles aux marins, et à terme de construire une base coopérative de courants de marée.

Le [code source est public](https://github.com/qdonnars/ohmywind) ([licence AGPL](https://github.com/qdonnars/ohmywind/blob/main/LICENSE)). Le modèle de financement repose sur le parrainage par des marques du nautisme, sans aucune influence sur les calculs ni sur les recommandations de l'outil.

> « Les données météo et océanographiques publiques sont d'une qualité remarquable, mais elles restent difficiles d'accès pour le plaisancier. OhMyWind les met au service de questions très concrètes : quand partir, par où passer. Nous nous concentrons sur le juste besoin : pas un logiciel de routage de plus, juste des réponses aux questions des plaisanciers. »
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
- **Comparer ses spots favoris** : [ohmywind.fr/comparer](/comparer)
- **Android** : [Google Play](https://play.google.com/store/apps/details?id=fr.ohmywind.app)
- **Méthodologie** : [ohmywind.fr/methodologie](/methodologie)
- **Carte des courants de marée** : [ohmywind.fr/methodologie/courants](/methodologie/courants)
- **Nouveautés (version 1.10 et précédentes)** : [ohmywind.fr/a-propos/nouveautes](/a-propos/nouveautes)
- **Serveur MCP** : `https://mcp.ohmywind.fr/mcp`
- **Tutoriel de connexion aux assistants IA (Claude, ChatGPT, Le Chat)** : [mcp.ohmywind.fr](https://mcp.ohmywind.fr) (en anglais)
- **Vidéos de démonstration** : [ohmywind.fr/youtube](https://ohmywind.fr/youtube)
- **Autres clients MCP (Cursor, VS Code, Goose…)** : [guide de démarrage](https://github.com/qdonnars/ohmywind#try-it-in-30-seconds) (en anglais)
- **Protocole MCP** : [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Code source** : [github.com/qdonnars/ohmywind](https://github.com/qdonnars/ohmywind)
- **Cap Innovation, Paris Nautic Show 2026** : [parisnauticshow.com/cap-innovation](https://www.parisnauticshow.com/cap-innovation/)
- **Revue de presse** : [ohmywind.fr/presse](/presse)
- **Confidentialité** : [ohmywind.fr/confidentialite](/confidentialite)
- **Association** : Libramer, association loi 1901
