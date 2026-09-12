# Marketing

Supports de communication d'OhMyWind, prêts à imprimer ou à diffuser. Chaque
support vit dans son dossier, avec sa source, ses ressources et ses sorties
générées.

Les brouillons d'audit et de wording plus anciens restent dans
[`../marketing-drafts/`](../marketing-drafts/).

| Support | Source | Sorties | Usage |
|---|---|---|---|
| [Flyer A5 écoles de voile](flyer-ecoles-de-voile/) | `flyer.html` | `pdf/flyer-a4-2-par-page.pdf`, `pdf/flyer-a5.pdf` | À déposer à l'accueil des écoles de voile, clubs et capitaineries |

## Flyer A5 écoles de voile

Un recto A5, fond blanc, conçu pour l'imprimante de bureau : aucun bord perdu,
tout le contenu tient dans une marge de sécurité de 6 mm. Le fichier principal
est la version **A4 paysage avec deux exemplaires côte à côte**, avec deux
repères de coupe dans la marge (rien au milieu, pour ne rien laisser sur le
bord une fois coupé).

### Imprimer

1. Ouvrir `flyer-ecoles-de-voile/pdf/flyer-a4-2-par-page.pdf`.
2. Papier A4, orientation paysage, **échelle 100 % (taille réelle)**, pas de
   « ajuster à la page ». Un papier un peu épais (120 à 160 g) tient mieux sur
   un présentoir.
3. Plier la feuille en deux ou aligner les deux repères, et couper au massicot
   ou aux ciseaux : deux flyers de 148 × 210 mm.

Pour un imprimeur qui veut un fichier à l'unité, `pdf/flyer-a5.pdf` est le même
flyer au format A5 seul.

### Modifier

Le flyer est une page HTML, `flyer-ecoles-de-voile/flyer.html`. Le texte se
change directement dedans, en respectant les règles de copy du projet :
vouvoiement, pas de tiret cadratin, un seul chiffre par affirmation. Les
polices et les couleurs sont celles du site (Inter, JetBrains Mono, tokens de
`packages/web/src/design/tokens.css`), les polices sont lues dans
`packages/web` sans copie.

Pour relire dans un navigateur : ouvrir `flyer.html` (une page A5) ou
`flyer.html?sheet=a4` (la feuille deux exemplaires).

Pour régénérer les PDF et les aperçus PNG :

```sh
cd marketing/flyer-ecoles-de-voile
./build.sh                       # trouve Chrome ou le Chromium de Playwright
CHROME=/chemin/vers/chrome ./build.sh
```

Le script ne dépend que d'un Chrome headless. Il écrit `pdf/` et `preview/`,
tous deux versionnés pour que le flyer soit récupérable sans rien construire.

### Ressources

Captures prises sur dev.ohmywind.fr le 12 septembre 2026, thème clair, en
français, avec Chrome piloté (DevTools MCP) et `colorScheme: light`. Dans le
localStorage avant navigation : `ow_lang=fr`, `ohmywind:onboarding-v1=done`,
et `ow_last_simulation_v1` supprimé (sinon `/plan` rouvre le formulaire au lieu
de calculer le deep-link). Ce Chrome n'a pas de police emoji : injecter la
webfont Noto Color Emoji en repli de `--ow-font-ui` avant la capture.

- `assets/capture-previsions-fr.png` : téléphone, 1080 × 2340 (viewport
  360 × 780 en ×3, mobile et tactile), page Explorer sur la passe des Grottes
  (`/?center=43.02,6.17&zoom=11` avec `ow_last_spot_v1` sur ce point).
- `assets/capture-plan-ipad-fr.png` : tablette en paysage, 2360 × 1640
  (viewport 1180 × 820 en ×2, tactile), page Planifier Saint-Malo vers Chausey
  (`/plan?wpts=48.66,-2.02;48.72,-1.95;48.87,-1.83&departure=2026-09-15T10:00`).
  Choisir une route et une heure sans avertissement : ils sont générés en
  français côté serveur et s'affichent tels quels ; sonder `POST
  /api/v1/passage` sur le Space dev jusqu'à ce que `passage.warnings` et
  `complexity.warnings` soient vides.
- `assets/qr-ohmywind.svg` : QR code vers `https://ohmywind.fr`, version 2,
  correction M. `assets/qr-google-play.svg` : QR code vers la fiche Google
  Play (`fr.ohmywind.app`), version 4, correction M. Les deux sont vérifiés
  décodables sur l'aperçu rendu. À refaire si une adresse change (commande en
  tête de `build.sh`).
- `assets/google-play-badge-fr.png` : badge officiel « Disponible sur Google
  Play », en français, tel que fourni par Google. Ne pas le modifier, garder
  sa zone de dégagement, et la mention « Google Play est une marque de Google
  LLC » dans le pied.

### Mentions obligatoires

Le pied du flyer porte, et doit garder :

- l'avertissement « aide à la décision, pas un instrument de navigation »,
  dans les mêmes termes que l'app et le README ;
- la licence (AGPL-3.0) et l'association porteuse (Libramer) ;
- l'attribution du fond de carte visible sur la capture, « © les contributeurs
  OpenStreetMap », exigée par la licence ODbL.

Le nom et le logo restent couverts par la [politique de marque](../TRADEMARK.md).

### Règles de copy propres au flyer

- Ne jamais promettre l'absence de publicité : le projet souhaite ne pas en
  mettre, il ne s'y engage pas. Les pastilles se limitent à gratuit, sans
  compte, sans traqueur, open source.
- iPhone : l'App Store est annoncé comme « à venir, avec plus de soutiens et
  d'utilisateurs », sans date.

### À faire plus tard

- Décliner en anglais si un club accueille beaucoup d'étrangers (l'app est
  déjà traduite en cinq langues).
