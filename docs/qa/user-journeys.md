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

### J6. Dark mode
- Étapes: basculer l'icône lune, recharger la page, rebasculer.
- Attendu: bascule immédiate de toute l'UI (carte comprise), préférence persistée au rechargement.

### J7. Bandeau rebrand OhMyWind → OhMyWind
- Étapes: premier affichage: lire le bandeau; cliquer la croix; recharger.
- Attendu: texte mentionne la redirection ohmywind.fr et l'open source; la croix ferme le bandeau; il ne réapparaît pas après rechargement.

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
- Étapes: ouvrir /config, onglet « Modèles météo ». Au toucher: saisir la poignée ⋮⋮ d'une ligne et la glisser deux positions plus bas. À la souris: saisir n'importe où sur une ligne. Puis balayer verticalement le corps d'une ligne (pas la poignée). Recharger la page.
- Attendu: le drag depuis la poignée (tactile) et depuis la ligne (souris) réordonne avec aperçu en temps réel; le balayage sur le corps de ligne fait défiler la page sans déclencher de drag; l'ordre persiste au rechargement. À vérifier sur Chrome ET Firefox Android: le bug d'origine (drag inerte) ne touchait que Firefox, dont l'API HTML5 drag-and-drop ignore le tactile.

## Historique des bugs trouvés via ces parcours

- 2026-07-11, J5: bandeau de plan non cliquable au toucher sur mobile; pire, le tap traversait vers la carte Leaflet et ajoutait un waypoint fantôme. Corrigé le 2026-08-01 (commit 8605393: pointer-events-auto + tap-to-expand). Note du 2026-08-02: une re-repro sur émulateur a produit un faux positif après le fix, cause probable: coordonnées de tap dérivées de bounds d'accessibilité périmés; en cas de doute, croiser avec un test navigateur local (elementFromPoint) avant de conclure.
- 2026-08-02, J10: réordonnancement des modèles inopérant au toucher sur Firefox Android (rapport utilisateur, Fabrice): l'API HTML5 drag-and-drop n'y émet jamais dragstart au doigt. Corrigé en réécrivant le drag en Pointer Events avec poignée dédiée (touch-action: none) visible sur mobile.
