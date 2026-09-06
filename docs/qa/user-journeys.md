# Parcours de tests utilisateur (QA manuelle ou sous-agent)

Checklist à dérouler avant toute promotion `dev` → `main`. Chaque parcours est autonome: précondition, étapes, résultat attendu. Un sous-agent peut exécuter un ou plusieurs parcours et rendre un verdict OK/KO par parcours, avec description précise de tout écart.

## Environnements

| Cible | URL / app | Quand |
|---|---|---|
| Web dev | https://dev.ohmywind.fr | avant chaque promotion |
| Web prod | https://ohmywind.fr | après promotion (smoke) |
| Android dev | app `fr.ohmywind.app.dev` (TWA sur dev.ohmywind.fr) | changements UI mobile ou wrapper |
| Android prod | app `fr.ohmywind.app` (TWA sur ohmywind.fr) | avant upload Play Store |

Outils: navigateur piloté (Chrome DevTools MCP) pour le web, émulateur Android + adb pour les apps (SDK dans `~/.bubblewrap/`, AVD `ohmywind`, cf. `packages/android/README.md`).

## Économie d'appels backend (rate limits)

Chaque création de spot déclenche des fetchs de prévisions multi-modèles et chaque « Calculer le passage » un appel de planification: le rate limiting du Space se consomme vite. Règles pour toute passe de QA:

1. Valider d'abord le comportement sur build local piloté (vite preview + navigateur), le device n'est que la confirmation finale: une seule passe device par cycle de correctif.
2. Ordonner les items du moins coûteux au plus coûteux: config et interactions pures (localStorage, zéro appel) d'abord, calculs de passage en dernier. Un échec d'environnement en début de passe ne gaspille alors aucun quota.
3. Réutiliser le spot et la route existants; ne créer un spot que s'il n'y en a aucun. Ne jamais relancer un calcul dont le résultat est déjà affiché.
4. Les parcours J4 (recherche, appels Photon) et J2/J3/J5 (prévisions, passage) sont les consommateurs; J6 et J10 sont gratuits.

## Parcours

### J1. Premier lancement et géolocalisation
- Précondition: stockage vierge (navigation privée, ou `pm clear` du navigateur sur émulateur; ne jamais `pm clear` en session partagée).
- Étapes: ouvrir l'app. Accepter la demande de position.
- Attendu: hint « Appui long pour placer votre premier spot » visible; après acceptation, la carte se centre sur la position (ou reste sur la France si position hors zone).

### J2. Création de spot
- Étapes: appui long (>1 s) sur une zone de mer.
- Attendu: dialogue « New spot » avec coordonnées; « Create » crée le spot, la carte affiche le marqueur et la vue prévisions s'ouvre.

### J3. Prévisions multi-modèles
- Précondition: un spot existe (J2).
- Étapes: observer le tableau horaire; swiper horizontalement; basculer les toggles Wind / Waves / Currents.
- Attendu: AROME HD listé en premier; vitesses en nœuds (jamais km/h); flèches de direction cohérentes; le tableau scrolle; chaque toggle change les données affichées. En Méditerranée, l'absence de données marées/courants est normale (seuils: courant >= 0.3 kt, marnage >= 0.5 m).

### J4. Recherche de lieu
- Étapes: taper « Porquerolles » dans le champ Search, choisir un résultat.
- Attendu: suggestions pertinentes; la carte se centre sur le lieu choisi.

### J5. Planification d'itinéraire
- Précondition: un spot existe (J2).
- Étapes: entrer en mode planification (bouton compas). Tracer une route d'au moins 2 segments par appuis sur la carte. Observer le bandeau/tiroir de plan (récapitulatif distance, durée, complexité). Taper dessus, puis essayer un swipe vertical dessus.
- Attendu: chaque waypoint s'ajoute avec segments visibles et longueurs; le bandeau de plan réagit au toucher (expansion/détail). ATTENTION, bug rapporté le 2026-07-11 sur mobile: bandeau non cliquable dans cette vue. Vérifier explicitement au toucher (pas à la souris).
- Étapes (pas d'un tronçon): calculer le passage, déplier un tronçon d'au moins 20 nm (deux pas ou plus). Observer la bande de pas colorée sous la ligne du tronçon, le bouton Moyenne / Détail et la carte compas + chiffres. Taper un pas, puis les flèches ‹ ›, puis Moyenne.
- Attendu: en Moyenne, la carte affiche « moyenne de N pas », les fourchettes (vent, mer, courant) et, quand les pas ne sont pas d'accord sur la direction, une bande sur l'anneau extérieur du compas (vent) et une bande sur l'anneau intérieur (courant), avec une aiguille pour le sens moyen du courant ; rien n'est écrit sur la rose, ce sont les libellés colorés du tableau (Vent, Mer, Courant, Cap) qui disent quelle bande est quoi. La moyenne n'affiche pas la décomposition de la vitesse mais remonte les drapeaux levés sur n'importe quel pas (« ⚠ Mer Formée », « ⚠ Vent Contre Courant ») au-dessus de « moyenne de N pas ». Sur un pas : tableau, Vitesse et l'addition sur une ligne. En Détail, l'en-tête donne l'heure du pas et son rang (« 2/3 »), les valeurs sont celles du pas, et le segment du pas s'affiche par-dessus le tronçon surligné de la carte, dans la couleur de son bloc, avec un liseré blanc. Un tronçon court (un seul pas) n'a ni bande, ni bouton, ni flèches : la carte montre directement le pas, sous ses heures. Sur bureau, la barre colorée sous Distance / Durée / Arrivée est cliquable : un clic sur un pas déplie son tronçon et ouvre ce pas (liseré dans la barre), un second clic revient à la moyenne. Bouton retour Android: replie le tronçon.

### J6. Dark mode
- Étapes: basculer l'icône lune, recharger la page, rebasculer.
- Attendu: bascule immédiate de toute l'UI (carte comprise), préférence persistée au rechargement.

### J8. Android: plein écran TWA et permissions
- Précondition: app installée (adb), assetlinks à jour sur l'hôte visé.
- Étapes: lancer l'app. Observer la barre du haut. Vérifier la demande de position.
- Attendu: AUCUNE barre Chrome (pas d'URL visible), app bord à bord; la demande de position apparaît et fonctionne. Si barre Chrome: vérifier `https://<host>/.well-known/assetlinks.json` (200, bon package, bonne empreinte) puis purger les données Chrome et relancer.

### J9. PWA (web)
- Étapes: sur Chrome desktop, vérifier l'invite d'installation (icône dans l'omnibox); installer; lancer.
- Attendu: fenêtre standalone, icône OhMyWind, thème sombre du manifest.

## Lancer un sous-agent sur ces parcours

Prompt type: « Exécute les parcours J2, J3, J5 de docs/qa/user-journeys.md contre https://dev.ohmywind.fr (ou l'app Android dev sur l'émulateur). Rends un verdict OK/KO par parcours avec repro exacte des écarts, texte seul. » Fournir au sous-agent: chemin adb et nom d'AVD pour l'Android, pièges connus de l'émulateur (popup Google Translate, panneau stylet Gboard, snackbar « Running in Chrome »).

### J10. Réordonnancement des modèles météo (/config)
- Étapes: ouvrir /config, onglet « Modèles météo ». Au toucher: (a) saisir la poignée ⋮⋮ d'une ligne et la glisser deux positions plus bas; (b) appui maintenu ~400 ms doigt immobile sur le corps d'une autre ligne jusqu'au soulèvement visuel, puis glisser; (c) balayer verticalement le corps d'une ligne sans attendre. À la souris: saisir n'importe où sur une ligne. Recharger la page.
- Attendu: (a) et (b) réordonnent avec aperçu temps réel (au soulèvement, la ligne grossit légèrement avec une ombre, sans menu contextuel iOS); (c) fait défiler la page sans déclencher de drag; la souris réordonne sans délai; l'ordre persiste au rechargement. À vérifier sur Chrome ET Firefox Android: le bug d'origine (drag inerte) ne touchait que Firefox, dont l'API HTML5 drag-and-drop ignore le tactile.

### J11. Langue de l'interface (/config)
- Étapes: ouvrir /config, sélecteur « Langue » au-dessus des onglets, choisir English, puis Deutsch, Italiano et Español. Revenir sur / puis /plan, lancer un calcul. Ouvrir /methodologie et /confidentialite. Recharger. Effacer la clé `ow_lang` du localStorage et recharger avec un navigateur en fr-FR, puis en pt-PT.
- Attendu: la page passe dans la langue choisie sans rechargement et `document.documentElement.lang` suit; une note sous le sélecteur signale que les avertissements du moteur de passage restent en français. Sur / et /plan, tables, panneau, dates (« Thu 3 Sept », « Do., 3. Sept. », « 08:00 ») et nombres (« 38.2 » en anglais, « 38,2 » ailleurs) suivent la langue; les avertissements calculés par le backend restent en français (limite connue). La page Confidentialité existe dans les cinq langues, la Méthodologie en français et en anglais (anglais servi aux lecteurs allemands, italiens et espagnols), chaque traduction s'ouvrant sur une ligne qui renvoie au texte français de référence. La langue choisie survit au rechargement. Sans choix mémorisé: interface en français avec un navigateur fr-FR, en anglais avec un navigateur pt-PT.

## Historique des bugs trouvés via ces parcours

- 2026-07-11, J5: bandeau de plan non cliquable au toucher sur mobile; pire, le tap traversait vers la carte Leaflet et ajoutait un waypoint fantôme. Corrigé le 2026-08-01 (commit 8605393: pointer-events-auto + tap-to-expand). Note du 2026-08-02: une re-repro sur émulateur a produit un faux positif après le fix, cause probable: coordonnées de tap dérivées de bounds d'accessibilité périmés; en cas de doute, croiser avec un test navigateur local (elementFromPoint) avant de conclure.
- 2026-08-02, J10: réordonnancement des modèles inopérant au toucher sur Firefox Android (rapport utilisateur, Fabrice): l'API HTML5 drag-and-drop n'y émet jamais dragstart au doigt. Corrigé en réécrivant le drag en Pointer Events avec poignée dédiée (touch-action: none) visible sur mobile.

## Pièges d'outillage (Chrome DevTools MCP)

- L'émulation réseau « Offline » coupe bien les requêtes de la page (`ERR_INTERNET_DISCONNECTED`) mais ne bascule pas `navigator.onLine` à `false` et ne couvre pas les fetch du service worker. Pour vérifier le bandeau « Hors connexion », forcer `navigator.onLine` et émettre `new Event("offline")` par script ; pour juger le cache du fond de carte, regarder ce qui s'affiche et le nombre d'entrées des caches `ow-basemap-*`, pas le trafic réseau.
- Les tables horaires défilent avec `scroll-behavior: smooth` : un test qui lit `scrollLeft` juste après l'avoir écrit rend un faux négatif ; attendre quelques centaines de millisecondes.
- Un `pointerId` synthétique non enregistré par le navigateur fait échouer `setPointerCapture` (NotFoundError) : sans effet avec un vrai doigt, à ne pas compter comme un écart.
- Le grep d'une chaîne dans `index.html` comme discriminant de build peut donner un faux positif entre deux builds Cloudflare successives ; préférer un test sur la valeur exacte d'une balise ou d'une clé de manifest.
