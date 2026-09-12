# Bench courants : règle du point SHOM le plus proche contre grille MARC

- Fenêtre : 2026-09-12, 25 h, coefficient 97 (vives-eaux)
- Graine : 42. Sans vérité terrain : le bench mesure des désaccords, pas des erreurs.

## 1. Désaccord SHOM / MARC selon la distance au point SHOM le plus proche

Points d'interrogation dispersés autour des points SHOM sur tout le plateau, 150 par tranche, pas horaire.

| Distance au point SHOM | n | Δvitesse moy. (kn) | médiane | p95 | pic MARC / pic SHOM (médiane) | MARC plus fort | Δdirection médiane (°) | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 à 0.5 km | 150 | 0.28 | 0.18 | 0.85 | 0.94 | 45 % | 9 | 54 |
| 0.5 à 1 km | 150 | 0.26 | 0.15 | 0.89 | 0.98 | 47 % | 8 | 65 |
| 1 à 2 km | 150 | 0.27 | 0.17 | 0.82 | 1.07 | 64 % | 7 | 54 |
| 2 à 3 km | 150 | 0.23 | 0.12 | 0.84 | 1.00 | 47 % | 6 | 51 |
| 3 à 5 km | 150 | 0.23 | 0.13 | 0.78 | 1.03 | 48 % | 6 | 46 |

## 2. Passes nommées, au point SHOM

Chaque passe est interrogée au point SHOM le plus proche de la coordonnée choisie à la main (« écart du choix » = distance entre les deux) : l'axe de l'atlas par construction, sans biais de pointage. Pas de 10 min. « Pic MARC à 400 m » = plus fort pic MARC sur un maillage de 125 m dans ce rayon : un pic MARC bas au point mais fort à 400 m est une veine de courant décalée, pas absente. Décalages = moyenne des |Δt| entre étales (resp. pics) SHOM et MARC appariés.

| Passe | Source SHOM | écart du choix (km) | atlas MARC | pic SHOM (kn) | pic MARC au point (kn) | pic MARC à 400 m (kn) | étales Δt (min) | pics Δt (min) |
|---|---|---:|---|---:|---:|---:|---:|---:|
| Goulet du Morbihan (Port-Navalo) | shom_c2d_558_morbihan | 0.24 | SUDBZH | 4.3 | 3.5 | 4.4 | 18 | 48 |
| Passage de la Teignouse | shom_c2d_558_quiberon | 0.29 | SUDBZH | 2.9 | 2.2 | 2.1 | 30 | 28 |
| Courreaux de Groix | shom_c2d_558_groix | 0.36 | SUDBZH | 0.5 | 0.4 | 0.4 | 0 | 35 |
| Goulet de Brest | shom_c2d_560_rade_brest | 0.20 | FINIS | 3.9 | 2.6 | 3.1 | 35 | 15 |
| Chenal du Four | shom_c2d_560_ouessant | 0.51 | FINIS | 1.4 | 1.3 | 2.2 | 22 | 35 |
| Chenal de la Helle | shom_c2d_560_ouessant | 0.19 | FINIS | 4.2 | 2.5 | 4.2 | 70 | 60 |
| Passage du Fromveur | shom_c2d_560_ouessant | 0.56 | FINIS | 6.6 | 7.3 | 7.6 | 20 | 35 |
| Raz de Sein | shom_c2d_560_sein | 0.25 | FINIS | 4.2 | 5.3 | 5.5 | 10 | 13 |
| Raz Blanchard | shom_c2d_562_hague | 0.49 | MANW | 10.1 | 8.4 | 9.3 | 10 | 12 |
| Raz de Barfleur | shom_c2d_561_barfleur | 0.77 | MANW | 4.5 | 4.8 | 4.9 | 18 | 45 |
| Saint-Malo, Petite Porte | shom_c2d_562_saint_malo | 0.68 | MANW | 1.6 | 1.8 | 1.9 | 12 | 35 |
| Pertuis d'Antioche | shom_c2d_559_pertuis_charentais | 0.26 | AQUI | 1.7 | 1.5 | 1.5 | 8 | 80 |
| Pertuis de Maumusson | shom_c2d_559_pertuis_charentais | 0.48 | AQUI | 3.4 | 0.8 | 2.0 | 50 | 37 |
| Pas de Calais (Gris-Nez) | shom_c2d_557_pas_de_calais | 2.01 | MANE | 3.7 | 3.7 | 3.7 | 15 | 12 |

## 3. Part du plateau servie par SHOM selon le seuil

1500 points mouillés tirés uniformément dans les atlas 250 m et 700 m, tous à moins de 5 km d'un point SHOM (donc servis par SHOM aujourd'hui). Part qui resterait à SHOM si le seuil descendait :

| Seuil | 0.5 km | 1 km | 1.5 km | 2 km | 3 km | 5 km |
|---|---:|---:|---:|---:|---:|---:|
| tout le plateau | 11 % | 34 % | 52 % | 66 % | 85 % | 100 % |
| AQUI (n=191) | 7 % | 25 % | 38 % | 49 % | 77 % | 100 % |
| FINIS (n=378) | 18 % | 48 % | 73 % | 82 % | 89 % | 100 % |
| MANE (n=174) | 4 % | 17 % | 28 % | 40 % | 76 % | 100 % |
| MANGA (n=34) | 3 % | 9 % | 15 % | 24 % | 41 % | 100 % |
| MANW (n=369) | 7 % | 28 % | 43 % | 59 % | 81 % | 100 % |
| SUDBZH (n=354) | 12 % | 42 % | 63 % | 81 % | 97 % | 100 % |

## Lecture

- Tableau 1 : si le désaccord grimpe avec la distance, la valeur SHOM « du point le plus proche » s'éloigne de ce que MARC voit à l'endroit demandé ; c'est le seuil des 5 km qui coûte, pas le prédicteur.
- Tableau 2 : dans les goulets étroits, un pic MARC nettement sous le pic SHOM à point SHOM proche (< 0,3 km) est le sous-maillage des 250 m. Un pic SHOM élevé à point SHOM lointain (> 1,5 km) sur une cellule MARC faible est le courant du raz collé sur un abri.
- Tableau 3 : ce que chaque seuil enlève à SHOM pour le donner à MARC.

## Conclusions (2026-09-12)

Un premier passage interrogeait des coordonnées « d'axe » choisies à la main ; il lisait MARC 0,4 kn contre SHOM 3,4 à Maumusson et 1,0 contre 5,9 au Morbihan. C'était le pointage : à Maumusson le chenal MARC (2,0 à 2,5 kn) passe 1 km au nord du point choisi, au Morbihan la veine passe 300 m à l'ouest. Le tableau 2 ci-dessus interroge au point SHOM et cherche le pic MARC dans 400 m ; c'est lui qui fait foi.

1. **Sur le plateau, la distance au point SHOM ne change rien** (tableau 1) : Δv médian 0,12 à 0,18 kn, pics à ±7 %, 6 à 9° de direction, dans les cinq tranches de 0 à 5 km. Abaisser le seuil ne change pas ce que l'utilisateur voit là.

2. **Au point SHOM, MARC 250 m retrouve les passes à ±25 % dès qu'on lui accorde une cellule d'écart** : Morbihan 4,4 contre 4,3, Helle 4,2 contre 4,2, Fromveur 7,6 contre 6,6, Sein 5,5 contre 4,2, Blanchard 9,3 contre 10,1, Barfleur, Saint-Malo, Antioche, Gris-Nez à moins de 10 %. Deux passes où MARC reste nettement sous SHOM : Maumusson (2,0 contre 3,4) et le Goulet de Brest (3,1 contre 3,9). Étales à 8 à 35 min près sauf Helle (70) et Maumusson (50).

3. **Ce qu'est vraiment SHOM C2D**, d'après la notice officielle du produit (édition 2005, `courants_2d_notice.pdf` sur diffusion.shom.fr) :
   - des **sorties de modèles** (TELEMAC-2D pour 558, 559, 561 à 565 ; différences finies 1988 et 1994 pour 557 et 560), calculées entre 1988 et 2002 sur la bathymétrie de l'époque (cartes marines seules pour 557 et 560) ;
   - un courant **moyenné sur la colonne d'eau**, ajusté sur quelques mesures ponctuelles pour approcher la surface ; « une valeur calculée est représentative d'une maille, de quelques centaines de mètres à plusieurs kilomètres » ;
   - des fichiers **rééchantillonnés par splines sur une grille plus lâche** que le modèle, avec quelques points ajoutés à la main sur les courants remarquables. Pas des fichiers : Morbihan 0,55 km, Rade de Brest 0,6, Sein 0,6, Cherbourg 0,35, cartouches de Bretagne nord 0,16 à 0,75 ; mais Iroise 2,7, Ouessant 1,3, Hague 2,7, Pertuis 2,8, Gironde 2,8, Bretagne sud 4,5, Baie de Seine 5,5, Vendée-Gironde 7, Manche 17, Gascogne 20 ;
   - précision annoncée E < 15 % sur les vitesses max à coefficient 95 (E < 30 % pour la Manche), déphasage moyen de 30 min (Pertuis) à 60 min (Sein, Barfleur, Cherbourg), « non évaluée » pour 557 et 560 (Iroise, Ouessant, Rade de Brest) ;
   - et, comme la légende le dit : « les valeurs ne tiennent pas compte des courants liés aux circonstances météorologiques ni à la circulation océanique générale ».

   MARC PREVIMER, lui, est MARS 2D à 250 m uniforme (700 m et 2 km au large), 38 constituants, bathymétrie récente. Donc SHOM n'est ni une mesure ni « plus fin » : sur la plus grande partie du plateau, le point SHOM le plus proche est un échantillon à 1,3 à 20 km d'un modèle de 1988 à 2002, contre une cellule MARC de 250 m. SHOM ne garde l'avantage que dans les cartouches où son modèle descendait à 50 à 150 m et où le fichier est dense (Golfe du Morbihan, Rade de Brest, cartouches de Bretagne nord et du Golfe normand-breton, Pertuis à la côte).

4. **Références extérieures** :
   - Fromveur : radars HF, maximum de courant d'environ 3,8 m/s (7,4 kn), pointes à 4 m/s (Sentchev et al. 2013 ; Thiébaut & Sentchev). Ici MARC 7,3 à 7,6 kn au coefficient 97, SHOM 6,6 (fichier OUESSANT_560, pas 1,3 km, 1994, non évalué). Avantage MARC.
   - Raz Blanchard : pointes au-delà de 4 m/s, jusqu'à 5 m/s (10 kn) en grandes vives-eaux (Lopez et al. 2020, Phil. Trans. R. Soc. A, et sources nautiques). MARC 8,4 à 9,3 kn, SHOM 10,1 (fichier HAGUE_562, 124 points, pas 2,7 km, 1998). Les deux plausibles ; Lopez et al. montrent qu'un MARS 3D à 120 m surestime le flot de 0,4 m/s près du cap, ce qui rappelle que 250 m près de la Hague reste incertain.
   - Maumusson : « 2 à 3 nœuds en vives-eaux », « dépassant parfois 4 nœuds » (Wikipédia, hisse-et-oh). SHOM 3,4, MARC 2,0 à 2,5 dans le chenal. Les deux dans la fourchette ; le modèle SHOM y descendait à 50 m, MARC 250 m ne résout pas un chenal mobile.
   - Goulet du Morbihan : « près de 9 nœuds » aux plus forts coefficients au courant de la Jument (sites du Golfe). SHOM 4,3 à 5,9 selon le point, MARC 3,5 à 4,5 à coefficient 97 : cohérents entre eux et avec un pic à 9 kn en grande marée plus à l'intérieur.

**Recommandation révisée** : la cascade « SHOM partout où il a un point à 5 km » n'est pas justifiée par la donnée. Sur le plateau les deux sources se valent ; dans les raz larges MARC colle mieux aux radars ; SHOM ne conserve un avantage que dans les cartouches fines. Règle proposée, à trancher en lot domaine : **SHOM d'abord seulement là où son fichier est dense** (point le plus proche à 0,5 km ou moins, ce qui, d'après le tableau 3, sélectionne 11 % du plateau et coïncide avec les cartouches à pas sub-kilométrique), **MARC ensuite, SMOC en repli**. À passer par le `sailing-domain-reviewer`, refaire ce bench après, et documenter le changement dans la méthodologie (qui présente aujourd'hui SHOM comme « la référence » sans dire que c'est un modèle de 1988 à 2002). La légende sous le tableau reste utile dans tous les cas : distance au point SHOM quand SHOM prime, maille quand MARC prime.
