# Courants de marée

Cette page complète la [méthodologie](/methodologie) d'OhMyWind. Elle décrit d'où viennent les courants de marée utilisés pour estimer un passage, comment la source est choisie à chaque point de la route, ce que chaque source sait voir, et où la couverture s'arrête.

## Sommaire

- [Sources, priorité et couverture](#sources-priorité-et-couverture)
- [Comment on déduit le courant en un point d'atlas](#comment-on-déduit-le-courant-en-un-point-datlas)

## Sources, priorité et couverture

Pour les passes critiques, OhMyWind ne se contente pas du SMOC à 8 km. Les courants de marée sont servis par une **cascade d'atlas** : chaque atlas est un jeu de constantes harmoniques précalculé, décrit par ses métadonnées (source, licence, résolution, rang de priorité, zone de validité), et le moteur ne connaît que ce format. Ajouter une zone du monde, c'est ajouter un atlas, pas du code.

**Les sources en production.**

**1. SHOM Atlas C2D (Service Hydrographique et Océanographique de la Marine).** L'édition numérique des atlas de courants de marée des côtes de France (Manche et Atlantique). Ce ne sont pas des mesures : d'après la notice du produit (édition 2005), ce sont des sorties de modèles de marée calculés entre 1988 et 2002 (TELEMAC-2D pour la plupart des zones, différences finies pour le Pas de Calais et l'Iroise), moyennées sur la colonne d'eau puis ajustées sur quelques mesures ponctuelles, et rééchantillonnées sur une grille de points plus lâche que le modèle. Le pas de cette grille est inférieur au kilomètre dans quelques cartouches (Golfe du Morbihan 0,55 km, Rade de Brest et Sein 0,6 km, cartouches de Bretagne nord) et de 1,3 à 20 km ailleurs (Ouessant 1,3 km, Iroise et Hague 2,7 km, Pertuis 2,8 km, Bretagne sud 4,5 km, Manche 17 km, Gascogne 20 km). Précision annoncée par le SHOM : écart moyen inférieur à 15 % sur les vitesses maximales à coefficient 95, déphasage de 30 à 60 min selon les zones, non évaluée pour l'Iroise, Ouessant et la Rade de Brest. 9 atlas, environ 13 000 points. Distribué sur data.gouv.fr sous Licence Ouverte 2.0. À chaque point, deux séries horaires de 13 valeurs U/V, l'une pour les vives-eaux (coefficient 95), l'autre pour les mortes-eaux (coefficient 45), de -6 h à +6 h autour de la pleine mer du port de référence de la zone.

**2. MARC PREVIMER (Modélisation et Analyse pour la Recherche Côtière, Ifremer + SHOM).** Atlas harmoniques continus à grille régulière, issus du modèle MARS 2D sur une bathymétrie récente. Résolutions : 250 m sur le Finistère, la Bretagne sud, la Manche et l'Aquitaine, 700 m sur le plateau de la Manche et du golfe de Gascogne, 2 km sur l'Atlantique nord-est (atlas ATLNE). 17 à 38 constituants harmoniques par cellule, prédicteur Schureman/Cartwright. Validation contre le marégraphe REFMAR de Brest (2008, 8 000 observations horaires) : RMSE 14 cm, r² 0,99 sur la hauteur.

**3. Open-Meteo SMOC : repli global** (déjà décrit ci-dessus, 8 km, marée issue de FES2014).

**La règle de priorité.** À chaque point de route, le moteur choisit ainsi :

```
si un point SHOM C2D est à 500 m ou moins           →  SHOM (les cartouches fines, maille 50 à 150 m)
sinon, parmi les atlas dont la zone de validité      →  l'atlas de rang le plus élevé,
       contient le point                                puis le plus fin (250 m, 700 m, 2 km)
sinon                                                →  Open-Meteo SMOC (repli global, 8 km)
```

Le rang est une décision écrite dans les métadonnées de l'atlas, pas une déduction : 3 estuaire ou passe, 2 côtier, 1 plateau, 0 bassin. À rang égal, la résolution la plus fine gagne. La **zone de validité** permet de confiner un atlas aux eaux où son producteur l'a validé : ATLNE couvre techniquement jusqu'à la mer du Nord, mais PREVIMER ne l'a validé que sur les côtes françaises, et une comparaison à trois ans de radar HF en baie allemande l'a mesuré 21 à 39 % sous les courants observés, avec 8 à 37° de retard de phase. Il est donc confiné au golfe de Gascogne, à la Manche et à la mer Celtique ; ailleurs, le repli global, dont la marée vient d'un modèle mondial validé, est la réponse honnête.

Pourquoi 500 m pour le SHOM et pas « partout où il a un point » : un bench sur 750 points du plateau, 16 passes et 1 500 points tirés au hasard (docs/bench/currents_resolution_2026-09-12_1347.md) a montré que SHOM et MARC s'accordent au large quelle que soit la distance (écart médian 0,15 kt), que MARC retrouve les pics des raz larges et colle mieux aux radars HF du Fromveur, et que SHOM ne garde l'avantage que là où son modèle descendait à 50 ou 150 m, c'est-à-dire les cartouches à pas sub-kilométrique. Le seuil de 500 m sélectionne exactement celles-là.

**Précision et confiance.** La maille d'un atlas dit ce qu'il peut voir : à 500 m ou mieux, une passe ; jusqu'à 1 km, un estuaire ; à 2 km, seulement « il y a de la marée ici » ; à 8 km, le large. La confiance affichée avec chaque valeur de courant en découle : haute à 1 km ou plus fin (SHOM, MARC 250 m et 700 m), moyenne au-delà (ATLNE 2 km, SMOC). Le champ `current_source` exposé sur chaque tronçon indique la source effectivement utilisée : `shom_c2d_558_morbihan`, `marc_finis_250m`, `openmeteo_smoc`. Sous le tableau des courants, une légende donne le détail : distance au point SHOM retenu, maille de la grille, ou maille de 8 km du repli.

**Ce qui est couvert, ce qui manque.** La carte ci-dessous montre le courant de marée calculé depuis l'atlas le plus fin disponible à chaque endroit (MARC à 250 et 700 m, BSH à 90 et 926 m, NorKyst à 800 m sur la côte norvégienne, Copernicus à 1,5 et 4 km, ATLNE à 2 km, FES2014 à 7 km), complété par les passes et raz connus, en quatre couleurs : un dégradé de vert là où une source de marée à 5 km ou plus fin couvre, du clair à 0,5 kt au foncé à 5 kt et plus (le raz Blanchard, le goulet de Brest, l'Elbe), très pâle là où la même source répond mais que la marée reste sous 0,5 kt (le large de Groix) ; pour les zones à plus de 1,5 kt que rien ne couvre, orange quand une source en licence ouverte est identifiée, violet quand les données existent mais sont fermées ou à clarifier, rouge quand aucune source n'est connue. Une passe compte comme couverte à 1 km ou plus fin, parce qu'une maille de 3 km ne voit pas un détroit de 3 km de large : un point violet ou orange peut donc rester au milieu d'une zone verte, la zone est couverte, la passe elle-même ne l'est pas (Gibraltar, Corryvreckan, Pentland Firth). Un clic sur la mer interroge le serveur et affiche la source qu'il choisirait à cet endroit. Le registre des sources, replié sous la carte, donne le producteur et la licence lue et datée de chacune, permet d'afficher son emprise, et se termine par une adresse pour en proposer une : toutes ne sont pas en libre accès, et c'est ce qui rythme l'extension de la couverture.

<div data-widget="tidal-map"></div>

## Comment on déduit le courant en un point d'atlas

Tous les atlas de la cascade, sauf le SHOM qui publie des séries horaires, partagent le même format : les amplitudes et phases harmoniques des composantes **U** (est-ouest) et **V** (nord-sud) du courant sont stockées par cellule (90 m à 4,2 km selon l'atlas), une valeur par constituant astronomique. Pour évaluer le courant à un instant $t$ et une position donnée, OhMyWind exécute le prédicteur Schureman/Cartwright séparément sur U et V :

$$
U(t) = U_0 + \sum_{i=1}^{N} H_i^U \cdot f_i(t) \cdot \cos\bigl(\sigma_i \cdot (t - t_0) + V_{0,i}(t_0) + u_i(t) - G_i^U\bigr)
$$

et symétriquement pour $V(t)$, avec :

- $H_i^{U/V}$ et $G_i^{U/V}$ : amplitude (m/s) et phase Greenwich (degrés) du constituant $i$ pour la composante considérée, lues dans la cellule de l'atlas ;
- $\sigma_i$ : pulsation du constituant $i$ (degrés par heure, par exemple $\sigma_{M_2} = 28{,}9841$ °/h) ;
- $V_{0,i}(t_0)$ : argument astronomique d'équilibre au début du jour de prédiction, calculé à partir des longitudes astronomiques de Cartwright (1985) ;
- $f_i(t),\ u_i(t)$ : corrections nodales (variation lente sur 18,6 ans liées aux mouvements de la lune) ;
- $U_0,\ V_0$ : résiduel moyen non-tidal 2008-2009 inclus dans l'atlas (capture la circulation moyenne, mais pas la variabilité météo court-terme).

OhMyWind reconstruit ainsi $U$ et $V$ pour chaque sondage, puis en déduit la **vitesse** et la **direction** du courant total :

$$
V_{\text{courant}} = \sqrt{U^2 + V^2}, \qquad \theta_{\text{courant}} = \operatorname{atan2}(U,\ V)
$$

Convention océanographique : $\theta_{\text{courant}}$ donne la direction "vers où" porte le courant, en degrés vrais (0° = Nord, 90° = Est). C'est cette valeur qui est ensuite projetée sur le cap du segment dans le calcul de SOG (étape 6).

Constituants : 38 pour MARC PREVIMER, 13 à 18 pour les atlas que nous analysons nous-mêmes (BSH, NorKyst, Copernicus, selon la durée de la série). Pour MARC, le jeu est un sous-ensemble du jeu standard de 60 constituants (dominé par M2, S2, N2, K2, K1, O1, P1 : la marée semi-diurne explique l'essentiel du signal en Atlantique français). Pour Brest, plus de 90 % de la variance du courant horizontal est portée par la composante tidale, ce qui justifie la précision native obtenue (RMSE 14 cm sur la hauteur, ratios comparables sur le courant).

