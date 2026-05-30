# OpenWind — TODO retours Hisse & Oh

Synthèse des retours du fil H&O (9–19 mai 2026).
Croisé avec les commits récents et la PR #142 (UX polish, mai 2026).

Légende : @pseudo = auteur du retour sur H&O.

---

## UI / repères (gros chantier identifié)

- [ ] Tuto / point d'interrogation contextuel à l'arrivée — @Weborg, @ledide, @Maindo, @Flora
  - WIP existant sur `feat/onboarding-tour-wip` (3-step tour, 269 lignes) à reprendre
- [ ] Distinction visible entre "favoris météo" (Save) et "route" (compas) — @ledide
- [ ] Contraste des icônes météo en **mode jour** (mode nuit OK) — @phil_972
- [ ] Afficher l'heure de mise à jour du run par modèle (tooltip desktop / chip mobile) — @Theeoo

## Tableaux modèles

- [ ] Sélection auto du modèle régional selon la zone du waypoint de départ (Harmonie NL/DMI, ICON D2) — @f_blc
  - (le fallback par segment livré en PR #142 traite déjà 80 % du besoin)

## Mobile

- [ ] Réorganiser les modèles dans `/config` sur mobile : le drag HTML5 ne fonctionne pas en tactile, le tap-to-swap est masqué par `draggable=true`. La tentative `matchMedia` (commit 8958c79) a été revertée car non concluante. À reprendre proprement (peut-être avec une lib drag tactile dédiée, ou un autre paradigme genre boutons ↑↓ sur chaque ligne).
- [ ] Slider d'intervalle multi-routages → stepper/chips/input direct (trop fin au doigt) — @f_blc
- [ ] PWA installable (raccourci écran d'accueil sans appli native) — @Lex34

## Routage / polaires

- [ ] Plusieurs flèches de vent simultanées sur la carte météo (visualiser une zone) — @f_blc
- [ ] Export GPX / KML de la route + rejouer une planif — @Weborg
- [ ] Mode simulation segment par segment avec champ de vent au fil de la nav — @yvesb
- [ ] Combinaison courant marée + océanique + dérive météo — note Tinqueen

## Bugs résiduels

(aucun reproduit en attente — les bugs Cherbourg et waypoints corrigés en PR #142)

---

## Déjà arbitrés / déclinés (à tracker pour réponse propre)

- [ ] Visualisation des champs de vent — @yvesb → **écarté** (rester léger)
- [ ] Mode offline — @yvesb → **écarté** (pas de DB serveur)
- [ ] Défilement auto du temps style Windy — @delices2 → **à arbitrer** (utile mais charge cognitive)

---

## Outillage / plomberie (chantiers techniques)

- [ ] Re-sync HF Space (mcp.openwind.fr) après merge PR #142 — sinon le motor/fallback ne tourne pas en prod
- [ ] Staging HF Space (preview backend) pour tester les branches Cloudflare Pages bout en bout
- [ ] Analytics : Plausible / Cloudflare Web Analytics + Sentry (suggestion Tinqueen)

---

## Pour mémoire — déjà livré

### PR #142 (mai 2026, ce sprint)

- Message d'erreur "horizon dépassé" enrichi (@Weborg)
- Ligne des heures figée au scroll horizontal sur tous les tableaux modèles (@Seter)
- Fallback modèle par segment quand un point est non couvert (@f_blc)
- Date/heure et position du scroll conservées au changement de spot favori (@thierry0809)
- Vitesse moteur configurable dans `/config` polaire — seuil + vitesse, opt-in (@Domde, @yvesb)
- Allure "Moteur" affichée quand >50 % de la distance du tronçon est sous moteur
- Section §5 méthodologie : explication du moteur (bypass η et k_vagues, courant gardé)
- Bug Cherbourg → carte qui part sur Marseille après Save + compas (@ledide)
- Bug waypoints périmés affichés après modification de la route (@Seter)
- Drawer /plan dynamique mobile : 3 hauteurs adaptées à l'avancement
- Compass FAB propage `?center=lat,lon` du spot courant

### Sprints précédents (récap 14/05 + commits antérieurs)

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
