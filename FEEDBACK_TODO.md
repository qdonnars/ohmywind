# OpenWind — TODO retours Hisse & Oh

Synthèse des retours du fil H&O (9–19 mai 2026) qui ne sont pas encore traités.
Croisé avec le récap du 14/05 et les commits récents (`leg distance`, `mobile UX waypoint/model reorder`, `polar + model priority`, `clapot court/suiveur`).

Légende : @pseudo = auteur du retour sur H&O.

---

## UI / repères (gros chantier identifié)

- [ ] Tuto / point d'interrogation contextuel à l'arrivée — @Weborg, @ledide, @Maindo, @Flora
- [ ] Distinction visible entre "favoris météo" (Save) et "route" (compas) — @ledide
- [ ] Contraste des icônes météo en **mode jour** (mode nuit OK) — @phil_972
- [ ] Message d'erreur "horizon dépassé" : ajouter "rafraîchissez la page / choisissez une date à < 10 j" pour éviter de perdre la planif — @Weborg
- [ ] Afficher l'heure de mise à jour du run par modèle (tooltip desktop / chip mobile) — @Theeoo

## Tableaux modèles

- [ ] Figer la ligne des heures au scroll (notamment GFS) — @Seter
- [ ] Sélection auto du modèle régional selon la zone du waypoint de départ (Harmonie NL/DMI, ICON D2) — @f_blc
  - alternative : rendre le drag & drop d'activation des modèles évident sur mobile (Android/Firefox)

## Mobile

- [ ] Conserver la date/heure sélectionnée quand on change de waypoint (Android) — @thierry0809
- [ ] Slider d'intervalle multi-routages → stepper/chips/input direct (trop fin au doigt) — @f_blc
- [ ] PWA installable (raccourci écran d'accueil sans appli native) — @Lex34

## Routage / polaires

- [ ] Vitesse moteur configurable dans `/config` polaire (vitesse seuil d'allumage + vitesse au moteur) — @Domde, @yvesb
- [ ] Plusieurs flèches de vent simultanées sur la carte météo (visualiser une zone) — @f_blc
- [ ] Export GPX / KML de la route + rejouer une planif — @Weborg
- [ ] Mode simulation segment par segment avec champ de vent au fil de la nav — @yvesb
- [ ] Combinaison courant marée + océanique + dérive météo — note Tinqueen

## Bugs résiduels

- [ ] Bugs d'affichage waypoints après planification — @Seter, @Tinqueen
- [ ] Reproduire : Cherbourg → carte qui part sur Marseille après "Save" puis compas — @ledide

---

## Déjà arbitrés / déclinés (à tracker pour réponse propre)

- [ ] Visualisation des champs de vent — @yvesb → **écarté** (rester léger)
- [ ] Mode offline — @yvesb → **écarté** (pas de DB serveur)
- [ ] Défilement auto du temps style Windy — @delices2 → **à arbitrer** (utile mais charge cognitive)

---

## Pour mémoire — déjà livré (récap 14/05 + commits récents)

- Archétypes 20 et 25 pieds (@Lex34)
- Barre de recherche réparée
- AROME HD pointe sur la 1.5 km Météo-France (@Lex34, Canet)
- Routage qui ne se perd plus en basculant météo ↔ routage (@f_blc)
- Bouton suppression waypoint visible sur mobile (@Jean Francisc0)
- Coef d'efficacité réglable sur la polaire (@yvesb, @Cpt Martin)
- Score de confort houle vs clapot + détection clapot court/suiveur (@yvesb)
- Modèles Harmonie DMI/KNMI et ICON D2 (@f_blc)
- Courants haute précision SHOM C2D + MARC PREVIMER (@nautonier)
- Distance des segments affichée sous le badge Tronçon (@roc)
- `/config` polaire + priorité modèles câblés dans `plan_passage`
