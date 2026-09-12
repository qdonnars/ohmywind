# Politique de confidentialité

*Dernière mise à jour : 12 septembre 2026*

OhMyWind est un planificateur de navigation à la voile open-source, disponible sur
[ohmywind.fr](https://ohmywind.fr) et sous forme d'application Android. Le responsable
du traitement est l'association Libramer (association loi 1901, RNA W751285736), dont
le siège social est situé 51 rue Fondary, 75015 Paris. L'application Android est
éditée et distribuée sur Google Play par Quentin Donnars. Pour toute question relative
à cette politique : [contact@ohmywind.fr](mailto:contact@ohmywind.fr).

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
votre appareil** (stockage local du navigateur ou de l'application). Seules les
coordonnées des points de passage quittent votre appareil : dès qu'un point est posé
sur la carte du planificateur, elles sont envoyées à EMODnet pour afficher la sonde ;
lorsque vous lancez une estimation de passage, elles sont envoyées au backend OhMyWind
(hébergé sur Hugging Face) pour effectuer le calcul, traitées en mémoire, puis
oubliées. Effacer les données du site dans votre navigateur (ou les données de
l'application dans Android) supprime tout.

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
| [OpenFreeMap](https://openfreemap.org/privacy/) | Zone de carte affichée | Fonds de carte (tuiles) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Zone de carte affichée, lorsque la couche des amers est active | Amers en surcouche (bouées, balises, phares) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordonnées de vos points de passage | Sonde (profondeur) sous chaque point de passage |
| [Ko-fi](https://more.ko-fi.com/privacy) | Rien, sauf si vous cliquez volontairement sur le lien de soutien | Dons |

Ces services sont des sous-traitants techniques indépendants, régis par leurs propres
politiques de confidentialité (liens dans le tableau).

Les polices de caractères sont servies depuis ohmywind.fr : afficher une page
n'envoie aucune requête à Google Fonts, et donc aucune adresse IP.

## Permissions Android

L'application Android demande une seule permission : la **localisation**, déléguée au
site web pour les usages décrits plus haut. Elle est optionnelle : l'application
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
