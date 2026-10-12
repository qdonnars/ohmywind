# Quoi de neuf dans OhMyWind

Toutes les versions d'OhMyWind, de la plus récente à la plus ancienne. Le site ohmywind.fr et le serveur MCP partagent un même numéro de version ; l'application Android garde le sien sur le Play Store.

Chaque version est aussi publiée sur la page [Releases](https://github.com/qdonnars/ohmywind/releases) du dépôt, et l'application affiche ce journal sur sa page « Quoi de neuf ». La marche à suivre pour publier une version est dans [docs/releases.md](docs/releases.md). English version: [CHANGELOG.en.md](CHANGELOG.en.md).

## 1.9.0 · 2026-10-12 · Voile-aviron et page Quoi de neuf

### Nouveautés

- Un nouveau bateau type, voile-aviron (environ 5 m), couvre les petits voiliers ouverts sans cabine (#447).
- Une page Quoi de neuf retrace les versions d'OhMyWind. On l'ouvre depuis le bouton « i », où un point discret signale une nouvelle version (#466, #469).
- Le communiqué de presse d'octobre 2026 se lit sur /presse/communique, en tête de la revue de presse (#464).

### Corrections

- Un plan au-delà des sept jours de prévisions, ou une comparaison restaurée dans le passé, est calculé par le serveur au lieu d'échouer, et GFS reste toujours disponible en dernier recours (#462).
- Les spots s'attrapent plus facilement au doigt, les pastilles d'Explorer sont lisibles en thème clair, « Ajouter un spot » se voit sur Comparer et la bande des pas tient dans la largeur de l'écran (#463).
- La méthodologie renvoie à l'onglet Bateau pour les polaires et distingue l'application web, l'API et le serveur MCP (#460).
- Les tableaux horaires d'Explorer se calent sur la colonne des modèles : plus de colonne ni d'étiquette de jour à moitié cachée après un défilement, et le trait entre deux jours garde la même couleur sur toutes les lignes ; le choix du bateau dans le plan affiche des noms lisibles (#465).
- Sur Comparer, la recherche de lieu mesure ses distances depuis vos spots ; un départ d'hier s'affiche « Hier » et non « Aujourd'hui » ; une arrivée le lendemain affiche son jour (#467).
- Le bouton du choix du bateau affiche le nom du bateau et non son identifiant, et la liste dit « monocoque » ; après « Annuler » sur un itinéraire en cours de tracé, le bouton retour ferme la comparaison sans quitter le plan (#469).
- « Ajuster » ouvre directement le calendrier du départ ; sur Comparer, « Ajouter un spot » passe dans le panneau « Spots », dont la pastille se remplit tant qu'il est ouvert (#473).

### Coulisses

- Le code mort est détecté en intégration continue et les en-têtes de licence manquants sont ajoutés (#461).
- Les agents GitHub ont plus de marge pour mener un correctif à son terme (#448).

## 1.8.0 · 2026-10-11 · Courants de marée : la bonne source, ou « inconnu »

### Nouveautés

- Le courant de marée vient d'une cascade d'atlas qui dépasse la France : BSH en baie allemande, Copernicus en mer du Nord, sur la façade ibérique et en Méditerranée (#426, #428, #430).
- Quand aucune source fiable ne connaît le courant (Rance, Seine maritime, bord d'un atlas, passe trop étroite pour la source), le plan affiche « courant inconnu » plutôt qu'un chiffre faux (#450, #454).
- Au large, là où la marée est faible, ce sont les courants généraux du modèle global Copernicus qui répondent (#453).
- Un avertissement signale les zones de forts courants que la source utilisée décrit mal (#426, #435, #436).
- La méthodologie gagne une sous-page Courants de marée, avec une carte plein écran de ce que l'application utilise en chaque point et le registre des sources (#438, #440, #441, #442).
- Sur cette carte, la fiche d'un point montre la décision exacte du serveur et les sources écartées (#433, #456).

### Corrections

- Un trajet hors de la zone AROME, à Gibraltar, au Portugal ou dans le détroit de Messine, n'échoue plus sur une erreur de requête (#429).
- Un point à terre est signalé comme tel au lieu de recevoir un courant (#434).
- La fiche de la carte des marées est lisible sur téléphone (#427).
- La carte de la méthodologie montre exactement ce que sert le serveur, zones de courant inconnu comprises (#452, #458).

### Coulisses

- Les courants calculés sont confrontés à des observations réelles, radars HF et courantomètres (#457).
- La Norvège et l'Islande ont été explorées puis laissées hors du périmètre servi, et Gibraltar est découpé hors des atlas Copernicus (#437, #439, #451).

## 1.7.0 · 2026-09-18 · Comparer ce trajet

### Nouveautés

- En bas des résultats, « Comparer ce trajet » essaie d'autres heures de départ ou jusqu'à trois itinéraires entre les mêmes points (#406, #407, #408, #410).
- Une carte de découverte présente ces deux comparaisons après votre premier plan (#410, #416).
- Quand le quota gratuit d'Open-Meteo est épuisé, le message dit quel compteur est atteint et à quelle heure il revient (#405).
- Une page Presse rassemble les articles parus sur OhMyWind, et le panneau À propos est réorganisé (#403, #404).

### Corrections

- Les avertissements du calcul sont traduits dans les cinq langues (#414).
- Renommer un spot ne recharge plus la page, et le jour affiché dans le tableau d'Explorer n'est plus en retard (#414).
- Le détail de la vitesse d'un pas ne fait plus passer le louvoyage pour un effet de la mer (#415).
- Le retour depuis une comparaison ramène au plan sans étape inutile (#417).

## 1.6.0 · 2026-09-12 · Un menu, Comparer mes spots et des résultats plus clairs

### Nouveautés

- Un menu en haut à gauche mène à Explorer, à Planifier et à la nouvelle page Comparer mes spots, qui met vos favoris côte à côte (#379).
- Les résultats du plan sont redessinés : distance, durée et arrivée en tête du tiroir, et la carte dégagée après le calcul (#397).
- Sur téléphone, la carte du plan répond mieux au doigt : un appui accidentel n'ajoute plus de point, un point retiré se rétablit d'un tap et un point se déplace après une courte prise (#401).
- Près de la côte atlantique, l'atlas du SHOM ne sert qu'à moins de 500 m de ses points, MARC prend le relais ensuite, et la source est indiquée sous le tableau des courants (#399).
- L'application Android passe en version 1.1.0, avec une icône monochrome pour les thèmes d'Android 13 et des raccourcis vers le planificateur et les réglages (#305, #306, #307, #347, #386).

### Corrections

- Le graphique de marée a un fond opaque, des pleines et basses mers à la minute et une légende du zéro (#394).

### Coulisses

- La politique de confidentialité désigne l'association Libramer comme responsable du traitement (#396).

## 1.5.0 · 2026-09-06 · Cinq langues, et l'iPhone bien cadré

### Nouveautés

- L'interface parle français, anglais, allemand, italien et espagnol, au choix dans la page Configuration (#368, #369, #374).
- La politique de confidentialité est traduite dans les cinq langues, la méthodologie en anglais, et les nombres suivent les conventions de la langue choisie (#369, #372).
- Quand le serveur météo se réveille, le calcul repart tout seul (#376).
- Les notes de convention sous les tableaux et dans le plan laissent la place aux données, la convention restant expliquée dans la méthodologie (#367).
- La frise du temps se fait glisser à la souris comme au doigt (#375).

### Corrections

- Sur iPhone, la barre de recherche ne passe plus sous la caméra, la barre d'état prend la couleur du thème et le bas de l'écran n'a plus de bande vide (#377, #378, #380, #381, #382).
- L'icône d'écran d'accueil sur iOS est nette (#371).
- Au moteur, le détail de la vitesse montre le moteur et non « polaire + mer » (#373).
- Saisir un angle de près ne change plus la valeur en cours de frappe, et les tableaux ne sont plus coupés en bas sous Firefox sur Mac (#375).
- Les cinq langues tiennent sur une ligne dans le sélecteur, en abrégé sur petit écran (#383).

## 1.4.0 · 2026-09-03 · Les pas d'un tronçon, et la carte hors ligne

### Nouveautés

- Un tronçon se déplie en pas, en moyenne ou en détail, dans le panneau comme sur la carte (#351).
- Le compas moyen d'un tronçon porte un anneau pour le vent et un autre pour le courant, et les alertes d'un pas remontent sur la moyenne (#362, #363, #364, #365).
- Hors ligne, l'application le signale et garde le fond de carte déjà parcouru (#349).
- L'installation sur l'écran d'accueil montre des captures de l'application, et la page se zoome de nouveau (#352, #357).
- L'onglet Vent rappelle la convention des flèches (#358).

### Corrections

- Un brouillon de route s'efface quand vous ouvrez le lien d'une autre route (#359).

### Coulisses

- Les requêtes de passage partent compressées, et un seul appel couvre les courants MARC de tout le corridor (#354, #355, #360, #361).
- Le relais devant le serveur MCP renvoie une erreur lisible quand le serveur dort, avec un cache et des mesures (#350).
- Les couleurs de l'interface s'appuient sur les jetons de design (#356).

## 1.3.3 · 2026-09-02 · Plus rapide, et le retour Android ferme les panneaux

### Corrections

- Le bouton retour d'Android ferme le panneau ouvert au lieu de quitter l'application (#314).
- Une mise à jour de l'application ne recharge plus la page pendant que vous l'utilisez (#316).
- Le décalage horaire affiché est celui de la date prévue, et non celui du jour (#310).
- La demande automatique de position échoue en silence au lieu d'afficher une erreur (#308).
- Une adresse inconnue affiche une page « introuvable » au lieu de la carte (#344).
- Le champ de recherche est annoncé correctement par les lecteurs d'écran (#328).

### Coulisses

- Le calcul d'un passage demande moins de requêtes, les polices sont servies par OhMyWind et les pages de documentation se chargent à la demande (#311, #312, #315, #318, #320, #321).
- L'API REST devient un paquet à part entière, avec un seul adaptateur marin pour le REST et le MCP, un journal structuré et des coûts de requête bornés (#317, #329, #331, #334, #337, #338).
- Le moteur de passage est réorganisé et la prédiction des courants SHOM est vectorisée (#335, #341, #345).

## 1.3.2 · 2026-09-01 · L'application rouvre sur votre dernier spot

### Corrections

- L'application rouvre sur le dernier spot consulté au lieu du premier favori (#302).
- L'avertissement d'usage quitte le bas du plan pour la fenêtre À propos, où il ne prend plus la place des résultats (#299).

### Coulisses

- Les commits sont signés automatiquement pour le DCO (#304).

## 1.3.1 · 2026-08-27 · Nouveau fond de carte OpenFreeMap

### Nouveautés

- Un avertissement rappelle sous chaque plan qu'OhMyWind aide à décider sans remplacer les instruments de navigation (#292).

### Corrections

- Le fond de carte passe à OpenFreeMap, sans clé ni quota, depuis que CARTO barre ses tuiles d'un filigrane pour les usages anonymes (#295).
- En thème sombre, les limites maritimes ne sont plus tracées en pleine mer (#296).
- Après un déploiement, l'application passe bien à la nouvelle version au lieu de rester sur l'ancienne (#294).

### Coulisses

- Les outils MCP rappellent aux assistants que les points de route doivent rester dans l'eau, et chaque plan transmis porte l'avertissement d'usage (#287, #292).
- Le coût d'une comparaison de fenêtres est borné : au-delà, le pas s'élargit au lieu de refuser (#293).
- La page d'accueil du serveur MCP montre une vraie session en vidéo (#288, #290, #291).

## 1.3.0 · 2026-08-20 · Carte marine, louvoyage et licence AGPL

### Nouveautés

- Une couche carte marine affiche les amers d'OpenSeaMap, et chaque point de route indique la profondeur d'après EMODnet (#274).
- Une étape plus serrée que l'angle de remontée de votre bateau s'affiche « Près (louvoyage) » (#280, #282).
- La météo est lue le long de la route au rythme de la vitesse du bateau, et non plus d'une vitesse fixe de 6 nœuds (#267).
- La vitesse au moteur peut aller jusqu'à 30 nœuds, et une valeur hors bornes est ramenée de façon visible au lieu d'être ignorée (#265).
- L'application Android passe en version 1.0.2, construite pour les versions récentes d'Android (#261, #273).

### Corrections

- Le seuil d'affalage du spi se saisit librement, sans zéro parasite (#270, #284).
- La poignée du tiroir de plan s'attrape au doigt (#283).
- L'aide au réordonnancement des modèles vous vouvoie aussi (#285).

### Coulisses

- Le projet passe sous licence AGPL-3.0-or-later, et les contributions se font sous DCO (#263, #264).
- Les agents de tri et de correctif voient les images jointes aux tickets (#271).

## 1.2.0 · 2026-08-14 · Plan mobile plus direct, polaire personnalisée en tête

### Nouveautés

- Sur mobile, le panneau du plan s'ouvre directement sur les résultats, les actions repliées au-dessus (#259).
- Votre polaire personnalisée apparaît en tête du sélecteur de bateau (#258).
- Le diagramme de polaire s'étend jusqu'au vent arrière, à 180° (#254).
- Le coefficient de performance du bateau est affiché sur la page du plan, avec une valeur par défaut revue (#248, #250).

### Corrections

- Les points sont centrés dans la partie visible de la carte, et le vent s'affiche dès que votre position est connue (#256, #257).
- Le bateau d'une polaire personnalisée l'emporte sur celui mémorisé dans l'adresse du plan (#252).
- Le bouton de changement de page rétrécit sur les petits téléphones (#244).
- Toute l'interface vous vouvoie (#253).
- Les icônes ont des coins transparents, avec une icône adaptative dédiée pour Android (#249).

### Coulisses

- Les empreintes de signature de l'application Android sont à jour (#251, #255).

## 1.1.1 · 2026-08-13 · Application Android en plein écran, licence et marque

### Corrections

- L'application Android installée depuis le Play Store s'ouvre en plein écran, sans barre d'adresse (#223).
- Un appui long sur une valeur du tableau de prévisions ne fait plus sortir de l'application vers la recherche Google (#226).
- Les spots et réglages enregistrés du temps d'OpenWind sont repris automatiquement (#239).
- Le bandeau qui annonçait le changement de nom disparaît (#221).

### Coulisses

- La licence MIT est rendue explicite et une politique d'usage encadre la marque OhMyWind (#221).
- Un agent automatique trie les nouveaux tickets GitHub et propose un correctif quand on le lui demande (#229, #233, #235, #237, #240, #245).

## 1.1.0 · 2026-08-07 · Importez la polaire de votre bateau

### Nouveautés

- Vous pouvez importer la polaire de votre bateau depuis un fichier, et télécharger un fichier d'exemple pour en voir le format (#215, #217).
- Le récapitulatif du plan indique le nom du bateau et d'où vient sa polaire (#217).

### Corrections

- Sur mobile, le bas de l'écran n'est plus masqué par la barre d'adresse, pincer hors de la carte ne zoome plus toute la page et tirer vers le bas ne recharge plus l'application (#213).
- La visite guidée parle de compas et non plus de boussole (#216).

## 1.0.2 · 2026-08-06 · Modèles météo réordonnables au doigt

### Nouveautés

- Une page Confidentialité détaille les données traitées par l'application, comme l'exige le Play Store (#212).

### Corrections

- Les modèles météo se réordonnent au doigt dans la page Configuration, y compris sur Firefox Android, par la poignée ou par un appui maintenu sur la ligne (#206, #209).
- Une application installée voit un nouveau déploiement dès son lancement suivant, au lieu de garder l'ancienne version jusqu'à quatre heures (#208).

### Coulisses

- L'application Android déclare ses empreintes de signature en vue du Play Store (#212).

## 1.0.1 · 2026-08-02 · OhMyWind au registre officiel des serveurs MCP

### Nouveautés

- OhMyWind est inscrit au registre officiel des serveurs MCP sous le nom fr.ohmywind/sailing-planner (#200).
- La description annonce une couverture mondiale grâce à ECMWF et GFS, la précision des atlas français venant en plus (#202).
- Le guide d'installation couvre les clients qui ne parlent que stdio, via mcp-remote, et propose trois exemples de questions (#198).
- Les outils MCP sont annotés comme ne faisant que lire, ce qui aide les assistants à les présenter (#198).

### Coulisses

- L'outil feedback, seul point d'écriture public du serveur, est retiré (#198).

## 1.0.0 · 2026-08-01 · Première version publique d'OhMyWind

### Nouveautés

- Tracez une route sur la carte, choisissez un bateau type ou réglez sa polaire, et OhMyWind estime la durée de chaque tronçon et sa difficulté de 1 à 5, avec la possibilité de comparer plusieurs heures de départ.
- Pour chaque point de la carte, Explorer affiche le vent, les vagues, la marée et les courants, avec AROME par défaut et d'autres modèles météo à classer dans la page Configuration.
- Sur la côte atlantique française, les courants viennent des atlas du SHOM et de MARC plutôt que du modèle global.
- Le serveur MCP permet de demander un plan à votre assistant (Claude, Le Chat et d'autres) en langage courant, sans compte ni clé.
- La recherche de lieux privilégie ce qui est proche de la carte et trouve les noms marins comme le Raz de Sein ou le Goulet de Brest (#178).
- Un bouton « centrer sur moi » arrive sur les cartes Explorer et Plan, et votre choix de géolocalisation est mémorisé (#177, #180).
- Passer d'Explorer à Plan garde la vue de la carte et se fait sans rechargement (#182, #183).

### Corrections

- Après trop de requêtes, le message donne le vrai délai d'attente, et une limite atteinte chez Open-Meteo n'apparaît plus comme une panne du serveur (#186, #194).
- Le bandeau du plan répond de nouveau au toucher (#187).

### Coulisses

- OpenWind devient OhMyWind (#185, #193).
- Le serveur public est durci : limitation de débit, coordonnées bornées et en-têtes de sécurité (#181, #187, #195).
- Un Worker Cloudflare sert le serveur MCP sous mcp.ohmywind.fr (#192).
