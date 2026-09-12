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
tout le contenu tient dans une marge de sécurité de 7 mm. Le fichier principal
est la version **A4 paysage avec deux exemplaires côte à côte**, avec la ligne
de coupe au milieu.

### Imprimer

1. Ouvrir `flyer-ecoles-de-voile/pdf/flyer-a4-2-par-page.pdf`.
2. Papier A4, orientation paysage, **échelle 100 % (taille réelle)**, pas de
   « ajuster à la page ». Un papier un peu épais (120 à 160 g) tient mieux sur
   un présentoir.
3. Couper au massicot ou aux ciseaux sur le pointillé central : deux flyers de
   148 × 210 mm.

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

- `assets/capture-previsions-fr.png` : capture 1080 × 1920 de la page
  Explorer sur dev.ohmywind.fr, thème clair, en français, du 12 septembre
  2026. À rafraîchir quand l'interface bouge : Chrome piloté (DevTools MCP),
  viewport 360 × 640 en ×3 mobile et tactile, `colorScheme: light`, avec dans
  le localStorage `ow_lang=fr`, `ohmywind:onboarding-v1=done` et
  `ow_last_spot_v1` sur le spot voulu, puis capture de `/?center=lat,lon&zoom=N`.
- `assets/qr-ohmywind.svg` : QR code vers `https://ohmywind.fr`, version 2,
  correction M. Il est vérifié décodable sur l'aperçu rendu. À refaire si
  l'adresse change (commande en tête de `build.sh`).

### Mentions obligatoires

Le pied du flyer porte, et doit garder :

- l'avertissement « aide à la décision, pas un instrument de navigation »,
  dans les mêmes termes que l'app et le README ;
- la licence (AGPL-3.0) et l'association porteuse (Libramer) ;
- l'attribution du fond de carte visible sur la capture, « © les contributeurs
  OpenStreetMap », exigée par la licence ODbL.

Le nom et le logo restent couverts par la [politique de marque](../TRADEMARK.md).

### À faire plus tard

- Ajouter le badge Google Play quand la fiche de l'app Android sera publique.
- Décliner en anglais si un club accueille beaucoup d'étrangers (l'app est
  déjà traduite en cinq langues).
