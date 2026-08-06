# Politique de confidentialité

*Dernière mise à jour : 6 août 2026*

OhMyWind est un planificateur de navigation à la voile open-source, disponible sur
[ohmywind.fr](https://ohmywind.fr) et sous forme d'application Android. Il est édité à
titre personnel et non commercial par Quentin Donnars. Pour toute question relative à
cette politique : [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Le principe général : **OhMyWind ne possède ni compte utilisateur, ni base de données,
ni outil de mesure d'audience**. Aucune donnée personnelle n'est conservée sur des
serveurs OhMyWind.

## Ce que l'application ne fait pas

- Aucun compte, aucune inscription, aucun identifiant.
- Aucun cookie de suivi, aucun traceur publicitaire.
- Aucun SDK d'analytics, de mesure d'audience ou de rapport de plantage.
- Aucune revente ni partage commercial de données, à qui que ce soit.

## Données traitées

### Position géographique

Si vous l'autorisez, votre position sert uniquement à centrer la carte et à obtenir
les prévisions près de vous. Elle est transmise aux services météo et cartographiques
listés ci-dessous, le temps de répondre à la demande, et n'est jamais enregistrée par
OhMyWind. La permission est optionnelle et révocable à tout moment dans les réglages
de votre navigateur ou d'Android.

### Plans de navigation et réglages

Vos points de passage, polaires de bateau et préférences sont stockés **localement sur
votre appareil** (stockage local du navigateur ou de l'application). Ils ne quittent
votre appareil que lorsque vous lancez une estimation de passage : les coordonnées des
points de passage sont alors envoyées au backend OhMyWind (hébergé sur Hugging Face)
pour effectuer le calcul, traitées en mémoire, puis oubliées. Effacer les données du
site dans votre navigateur (ou les données de l'application dans Android) supprime
tout.

## Services tiers

Pour fonctionner, l'application appelle directement les services suivants depuis votre
appareil. Comme pour toute requête Internet, chacun voit votre adresse IP ; le tableau
indique les données applicatives transmises en plus.

| Service | Données transmises | Finalité |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordonnées géographiques consultées | Prévisions de vent, vagues, marées ; géocodage |
| Backend OhMyWind, hébergé par [Hugging Face](https://huggingface.co/privacy) | Coordonnées et points de passage | Calcul du plan de passage |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordonnées géographiques | Géocodage inverse (nom du lieu affiché) |
| [Photon (Komoot)](https://photon.komoot.io) | Texte de vos recherches de lieu | Recherche de lieux |
| [CARTO](https://carto.com/privacy) | Zone de carte affichée | Fonds de carte (tuiles) |
| [Google Fonts](https://policies.google.com/privacy) | Adresse IP | Chargement des polices de caractères |
| [Ko-fi](https://more.ko-fi.com/privacy) | Rien, sauf si vous cliquez volontairement sur le lien de soutien | Dons |

Ces services sont des sous-traitants techniques indépendants, régis par leurs propres
politiques de confidentialité (liens dans le tableau).

## Permissions Android

L'application Android demande une seule permission : la **localisation**, déléguée au
site web pour les usages décrits plus haut. Elle est optionnelle — l'application
fonctionne sans, il suffit alors de rechercher un lieu manuellement.

## Vos droits

Conformément au RGPD, vous disposez de droits d'accès, de rectification, d'opposition
et d'effacement. OhMyWind ne conservant aucune donnée personnelle côté serveur,
l'essentiel s'exerce directement sur votre appareil : effacez les données du site ou
de l'application. Pour toute question ou demande :
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Évolution de cette politique

Toute modification sera publiée sur cette page, avec mise à jour de la date en tête de
document.
