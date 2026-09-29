# Feedback radar — sources surveillées

Ce fichier est lu par `.github/workflows/feedback-radar.yml` à chaque passage.
On l'édite librement pour ajouter ou retirer une source, sans toucher au workflow.
Son contenu vient du repo, il fait donc foi (contrairement aux pages web lues par l'agent).

## 1. Fils suivis (relus intégralement à chaque passage)

Coller ici l'URL de chaque fil où OhMyWind a été présenté ou discuté.
Les moteurs de recherche indexent mal les forums : cette liste compte plus que la découverte.

| Plateforme | Langue | URL | Note |
|---|---|---|---|
| Hisse-et-Oh | fr | <!-- https://www.hisse-et-oh.com/sailing/... --> | Fil de présentation |
| Reddit r/voile | fr | <!-- https://www.reddit.com/r/voile/comments/... --> | |
| Reddit r/sailing | en | <!-- https://www.reddit.com/r/sailing/comments/... --> | |
| Boote-Forum | de | <!-- https://www.boote-forum.de/threads/... --> | Utilisateurs allemands |
| Bateaux.com (commentaires) | fr | https://www.bateaux.com/article/52477/ohmywind-le-projet-open-source-qui-veut-repenser-la-preparation-d-une-navigation | |
| Boatnews (commentaires) | en | https://www.boatnews.com/story/52477/ohmywind-the-open-source-project-that-aims-to-rethink-how-we-prepare-for-a-sailing-trip | |
| Boote (commentaires) | de | https://www.boote-magazin.de/ausruestung/technik/ohmywind-wetterrouting-open-source/ | |
| Yacht (commentaires) | en | https://www.yacht.de/en/sailing-knowledge/navigation/navigation-ohmywind-free-weather-planner-with-ai-integration/ | |
| Google Alerts RSS | — | <!-- https://www.google.com/alerts/feeds/... --> | Vraie recherche Google |

### Accès connus (constatés au passage à blanc du 29/09/2026)

Pour éviter à l'agent de gaspiller des tours sur des impasses :

- **Reddit** : WebFetch bloqué. Seule voie : `/tmp/radar/reddit.json`, préparé par le workflow via l'API JSON publique (peut échouer depuis les runners GitHub).
- **Hisse-et-Oh** : la recherche interne est rendue en JavaScript, donc rien d'exploitable. Seules les URL de fils listées ci-dessus fonctionnent.
- **Boote-Forum** : la recherche est interdite par robots.txt. Même règle : URL de fils uniquement.
- **Segeln-Forum** : pas de page de recherche publique exploitable. URL de fils uniquement.
- **Play Store** : les avis ne sont pas dans le HTML. Pour les récupérer, il faut l'API Play Developer (compte de service), à ajouter plus tard comme step déterministe.
- **Glama** : la page Discussions est interdite par robots.txt.
- **Moteur de recherche** : il n'indexe quasiment aucun fil de forum mentionnant OhMyWind. Les résultats sont dominés par nos propres PR GitHub, à ignorer.
- **Google Alerts** : créer une alerte « OhMyWind » en flux RSS et coller l'URL du flux ci-dessous. C'est la vraie recherche Google, en toute légalité.

## 2. Recherches de découverte (nouveaux fils)

Lancées via WebSearch à chaque passage (lun, mer, ven, sam, dim) ; tout résultat nouveau et pertinent est traité,
puis proposé en fin de run pour ajout à la section 1.

- `"OhMyWind"`
- `"ohmywind.fr"`
- `"OhMyWind" site:reddit.com`
- `"OhMyWind" site:hisse-et-oh.com`
- `"OhMyWind" site:boote-forum.de`
- `"OhMyWind" Segeln App`
- `"OhMyWind" navegación vela`

## 3. Revue de presse (mentions web)

Requêtes lancées à chaque passage (lun, mer, ven, sam, dim) pour repérer articles, blogs, vidéos, annuaires d'apps.
Toute mention nouvelle est consignée dans l'issue épinglée « 📰 Revue de presse OhMyWind ».

- `OhMyWind`
- `"OhMyWind" application voile`
- `"OhMyWind" appli navigation gratuite`
- `"OhMyWind" Segel App` / `"OhMyWind" Törnplanung`
- `"OhMyWind" sailing app`
- `"OhMyWind" app vela`
- `"OhMyWind" aplicación vela`
- `"OhMyWind" Libramer`
- `"OhMyWind" MCP` (annuaires MCP, blogs tech)
- `"OhMyWind" Play Store` / `"fr.ohmywind.app"`

Mentions déjà connues au 29/09/2026 (état initial de la revue de presse, sans commentaires lecteurs à cette date) :

| Article | Date | Reprises (même texte = une seule mention) |
|---|---|---|
| Bateaux.com #52477 « OhMyWind, le projet open source qui veut repenser la préparation d'une navigation » | 30/08/2026 | boatnews.com (EN), boote.com (DE), barchenews.it (IT), + ES probable |
| YACHT / BOOTE, Hauke Schmidt, « Kostenloser Wetterplaner mit KI-Anschluss » | 01-02/09/2026 | boote-magazin.de (DE), yacht.de/en (EN) |
| Glama : fiche serveur MCP + connecteur `fr.ohmywind/sailing-planner` | — | annuaire, pas un article |

Critiques exprimées par YACHT/BOOTE, déjà classées (ne pas re-traiter) :
- Pas de routage automatique, pas de carte marine, pas d'évitement des dangers : **non-objectifs** (voir CLAUDE.md).
- Marées et courants négligés en Méditerranée : **par conception**.
- Pas de recalcul itératif des heures de passage : **vrai manque**, confirmé dans le code (`sampling._layout_mid_times` échantillonne la météo à des heures calculées avec une vitesse de croisière fixe). Issue proposée au passage à blanc, à créer par qdonnars ; ensuite, le radar la retrouvera par dédoublonnage.
- Seulement 7 archétypes de polaires : **constat exact**, piste « polaires personnalisées » à arbitrer.

## 4. Hors périmètre (pas de feedback à en tirer)

- github.com/qdonnars/ohmywind (déjà des issues)
- ohmywind.fr et ses sous-domaines
- Pages Libramer (contenu publié par nous)
