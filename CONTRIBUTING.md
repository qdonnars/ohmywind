# Contribuer à OhMyWind

Merci de votre intérêt. Les contributions sont bienvenues, en particulier sur
les polaires de nouveaux archétypes, l'extension de la couverture MARC, les
corrections et la documentation.

## Avant de commencer

- Les issues et les PR se passent sur GitHub, en français ou en anglais.
- Le dépôt suit les conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Les tests doivent passer avant tout commit : `uv run pytest` côté Python
  (`packages/data-adapters`, `packages/mcp-core`, `packages/hf-space`),
  `npm run test` côté web.
- Lint : `uv run ruff check .` côté Python, `npm run lint` côté web.

## Signer vos commits (DCO)

Toute contribution doit être signée avec :

```
git commit -s
```

Cette option ajoute une ligne `Signed-off-by: Votre Nom <email>` à la fin du
message de commit. Elle atteste que vous acceptez le
[Developer Certificate of Origin](DCO.txt) (DCO 1.1, le texte standard du
projet Linux).

En signant, vous certifiez trois choses :

1. vous avez écrit cette contribution, ou vous avez le droit de la soumettre
   sous la licence du projet ;
2. si elle reprend du code existant, ce code est sous une licence open source
   compatible et vous en respectez les conditions ;
3. vous comprenez que la contribution est publique et sera conservée avec
   votre signature.

Si vous avez oublié de signer, `git commit --amend -s` corrige le dernier
commit, et `git rebase --signoff origin/dev` reprend toute la branche.

### Ne plus y penser

`git commit -s` fonctionne tant qu'on s'en souvient, et le dépôt a accumulé
46 commits non signés sur 60. Le hook `.githooks/prepare-commit-msg` ajoute la
ligne à votre place, sans doublon si vous avez déjà passé `-s`, et sans rien
poser sur les commits de merge, que le contrôle exempte. Activez-le une fois
par clone :

```
make hooks
```

`make install` le fait déjà, donc une installation normale suffit. Le hook
utilise l'identité que git résoudrait de toute façon (`user.name` et
`user.email`) : signer reste votre acte, il n'est plus votre corvée.

## Vos droits d'auteur restent les vôtres

Le DCO n'est pas un CLA : vous ne cédez rien. Vous restez titulaire du droit
d'auteur sur chaque ligne que vous écrivez. Votre signature certifie
uniquement l'origine de la contribution et autorise sa diffusion sous la
licence du projet.

## Licence des contributions

Toute contribution est diffusée sous [AGPL-3.0-or-later](LICENSE), comme le
reste du projet.

## Si vous êtes salarié

Certains contrats de travail attribuent à l'employeur les droits sur le code
écrit par le salarié, parfois même en dehors du temps de travail. Avant de
contribuer, vérifiez que votre contrat ou votre clause de propriété
intellectuelle vous le permet, ou demandez l'accord écrit de votre employeur.
