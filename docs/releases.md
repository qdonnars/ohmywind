# Publier une version

OhMyWind porte un seul numéro de version pour le site et le serveur MCP, en [semver](https://semver.org/lang/fr/) : une version par jour de mise en production, **mineure** (1.9.0) quand la promotion apporte une nouveauté visible, **corrective** (1.8.1) quand elle ne fait que corriger. L'application Android garde son propre numéro (`appVersion` dans `packages/android/twa-manifest.json`) ; quand une version en livre une, les notes le disent.

Trois endroits portent la version, et un test vérifie qu'ils s'accordent :

- `CHANGELOG.md` (français, la référence) et `CHANGELOG.en.md` (traduction, servie aussi en allemand, italien et espagnol) : la page Quoi de neuf de l'application (`/a-propos/nouveautes`) les affiche, et les releases GitHub en copient les sections ;
- `"version"` dans `packages/web/package.json`, injecté au build et affiché dans le menu et le panneau À propos ;
- le tag `vX.Y.Z` sur le commit de merge de la promotion, sur `main`.

## Au fil de l'eau, sur `dev`

Les changements à venir s'écrivent en tête des deux journaux, sous une section unique :

```
## 1.9.0 · Prochaine version · Titre en une ligne
```

(`Next release` dans `CHANGELOG.en.md`), puis trois listes au plus, dans cet ordre : `### Nouveautés`, `### Corrections`, `### Coulisses` (`New`, `Fixes`, `Behind the scenes`). Une phrase par puce, écrite pour les utilisateurs, avec les numéros de PR entre parenthèses (`(#462)`) : la page les transforme en liens, GitHub aussi. Pas de tiret cadratin, le vouvoiement quand on s'adresse au lecteur. La section n'apparaît pas sur ohmywind.fr, seulement sur dev.ohmywind.fr.

## À chaque promotion `dev` vers `main`

1. **Dater la section**, dans la PR de promotion : `Prochaine version` devient la date de mise en production (`2026-10-18`), `Next release` aussi, et le numéro est ajusté (mineur ou correctif).
2. **Monter la version** dans `packages/web/package.json` au même numéro, puis `npm install --package-lock-only` à la racine pour le lockfile. `npx vitest run src/content` (dans `packages/web`) vérifie que les deux journaux et `package.json` s'accordent.
3. **Merger la promotion** en merge commit, comme toujours.
4. **Taguer le commit de merge** sur `main`, hors heures de bureau :

   ```sh
   V=1.9.0
   git fetch origin
   git tag -a "v$V" origin/main -m "OhMyWind $V" -m "Titre en une ligne"
   git push origin "v$V"
   ```

   Le push d'un tag `v*` lance `publish-mcp-registry.yml`, qui republie `server.json` au registre MCP sous ce numéro.
5. **Publier la release GitHub**, avec la section du journal pour notes :

   ```sh
   awk -v v="$V" 'index($0, "## " v " · ") == 1 {f=1; next} /^## /{f=0} f' CHANGELOG.md > "/tmp/notes-$V.md"
   gh release create "v$V" --verify-tag --latest \
     --title "$V · 18 octobre 2026 · Titre en une ligne" --notes-file "/tmp/notes-$V.md"
   ```

Les versions 1.0.0 à 1.8.0 ont été taguées et publiées après coup, le 11 octobre 2026, sur le dernier commit de `main` de chaque jour de mise en production ; `v1.0.1` existait déjà et n'a pas bougé.
