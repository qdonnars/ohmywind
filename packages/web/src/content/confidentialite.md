# Politique de confidentialité

*Dernière mise à jour : 24 novembre 2026*

OhMyWind est un planificateur de navigation à la voile open-source, disponible sur
[ohmywind.fr](https://ohmywind.fr) et sous forme d'application mobile. Le responsable du
traitement est l'association Libramer (association loi 1901, RNA W751285736), dont le
siège social est situé 51 rue Fondary, 75015 Paris. Pour toute question relative à cette politique :
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

Le principe général : **OhMyWind ne tient aucun fichier sur vous**. Il n'y a ni compte
utilisateur, ni base de données, ni outil de mesure d'audience. Ce que l'application
envoie sert à répondre à la demande en cours ; les seules traces sont des journaux
techniques, décrits plus bas.

## Ce que l'application ne fait pas

- Aucun compte, aucune inscription, aucun identifiant.
- Aucun cookie de suivi, aucun traceur publicitaire.
- Aucun SDK d'analytics, de mesure d'audience ou de rapport de plantage.
- Aucune revente ni partage commercial de données, à qui que ce soit.

## Données traitées

### Position géographique

Si vous l'autorisez, votre position sert à centrer la carte, à afficher les prévisions à
cet endroit et à classer les lieux proches lors d'une recherche. Elle est transmise aux
services listés ci-dessous, le temps de répondre à la demande. Elle n'est conservée dans
aucune base ; ses coordonnées peuvent figurer, 7 jours au plus, dans le journal
technique du relais décrit plus bas. La permission est optionnelle et révocable à tout moment dans
les réglages de votre navigateur ou de votre téléphone.

### Plans de navigation et réglages

Vos spots, points de passage, polaires de bateau et préférences sont stockés
**localement sur votre appareil** (stockage local du navigateur ou de l'application).
Effacer les données du site dans votre navigateur (ou les données de l'application dans
les réglages de votre téléphone) supprime tout.

Ce qui quitte votre appareil, et pourquoi :

- **Un lieu ouvert sur la carte**, ou votre position si vous l'avez autorisée : ses
  coordonnées sont envoyées à Open-Meteo pour les prévisions, et au backend OhMyWind
  pour le trait de côte, la marée et les courants.
- **Un point de passage**, dès qu'il est posé sur la carte du planificateur : ses
  coordonnées sont envoyées à EMODnet pour afficher la sonde.
- **Un trajet que vous estimez ou comparez** : ses coordonnées sont envoyées à
  Open-Meteo et au backend OhMyWind pour les prévisions, la marée et les courants le long
  de la route. Pour une estimation de passage, le backend reçoit aussi la date de départ
  ou d'arrivée, le bateau (type de bateau ou polaire), le coefficient de performance et
  les modèles choisis, et fait le calcul en mémoire.

## Journaux techniques

Le backend OhMyWind écrit une ligne par requête : la méthode, le chemin sans ses
paramètres (par exemple `/api/v1/passage`), le statut de la réponse, sa durée, sa
taille, et une empreinte courte calculée à partir de l'adresse de l'appelant, qui sert
seulement à repérer un abus. Il n'y écrit jamais d'adresse IP, de coordonnées, de texte
de recherche ni de trajet. Pour limiter le nombre de requêtes par minute, l'adresse est
gardée en mémoire le temps de cette limite, sans être écrite nulle part.

Le relais placé devant le backend, opéré par Cloudflare, garde pendant 7 jours au plus
un journal technique de chaque requête : l'adresse web demandée, en entier, et des
informations techniques sur l'appelant fournies par Cloudflare, qui peuvent inclure son
adresse IP. Pour les demandes de trait de côte, de marée et de courants autour d'un
lieu, cette adresse web contient les coordonnées du lieu. Le contenu des requêtes n'y figure pas : les
points de passage, la date et le bateau d'une estimation n'y apparaissent jamais. Ce
journal sert à diagnostiquer les pannes et n'est utilisé pour rien d'autre ; il
s'efface de lui-même.

## Services tiers

Pour fonctionner, l'application fait appel aux services suivants. Comme pour toute
requête Internet, chacun voit votre adresse IP ; le tableau indique les données
applicatives transmises en plus.

| Service | Données transmises | Finalité |
| --- | --- | --- |
| [Cloudflare](https://www.cloudflare.com/privacypolicy/) | Requêtes vers le site et vers le backend OhMyWind ; journal des requêtes relayées, 7 jours au plus (voir « Journaux techniques ») | Hébergement du site ; relais vers le backend |
| Backend OhMyWind, hébergé par [Hugging Face](https://huggingface.co/privacy) | Coordonnées des lieux ouverts et des trajets consultés ; lors d'une estimation, points de passage, date, bateau et réglages | Trait de côte, marée et courants ; calcul du plan de passage |
| [Open-Meteo](https://open-meteo.com/en/terms) (forecast, marine, geocoding) | Coordonnées des lieux et des trajets consultés ; texte de vos recherches de lieu, si Photon ne répond pas | Prévisions de vent, vagues, marées ; recherche de lieux de secours |
| [Photon (Komoot)](https://photon.komoot.io) | Texte de vos recherches de lieu et, si elle est connue, une position arrondie (la vôtre si vous l'avez autorisée, ou un point de la carte affichée) | Recherche de lieux, classés par proximité |
| [Nominatim / OpenStreetMap](https://osmfoundation.org/wiki/Privacy_Policy) | Coordonnées du point où vous créez un spot ; zone de carte affichée, sur les rares appareils qui ne peuvent pas afficher le fond de carte habituel | Nom du lieu (géocodage inverse) ; fond de carte de secours |
| [OpenFreeMap](https://openfreemap.org/privacy/) | Zone de carte affichée | Fonds de carte (tuiles) |
| [OpenSeaMap](https://www.openseamap.org/index.php?id=imprint) | Zone de carte affichée, lorsque la couche des amers est active | Amers en surcouche (bouées, balises, phares) |
| [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/privacy-statement) | Coordonnées de vos points de passage | Sonde (profondeur) sous chaque point de passage |
| [Ko-fi](https://more.ko-fi.com/privacy) | Rien, sauf si vous cliquez volontairement sur le lien de soutien | Dons |

Ces services sont des sous-traitants techniques indépendants, régis par leurs propres
politiques de confidentialité (liens dans le tableau). Certains sont opérés par des
sociétés établies hors de l'Union européenne, notamment Cloudflare et Hugging Face, aux
États-Unis.

Les polices de caractères sont servies depuis ohmywind.fr : afficher une page
n'envoie aucune requête à Google Fonts, et donc aucune adresse IP.

## Permissions de l'application mobile

L'application mobile demande une seule permission : la **localisation**, déléguée au
site web pour les usages décrits plus haut. Elle est optionnelle : l'application
fonctionne sans, il suffit alors de rechercher un lieu manuellement.

## Vos droits

Conformément au RGPD, vous disposez de droits d'accès, de rectification, d'opposition
et d'effacement. OhMyWind ne tenant ni compte ni fichier vous
concernant, et le journal du relais s'effaçant de lui-même en 7 jours au plus, l'essentiel s'exerce directement sur votre appareil : effacez les
données du site ou de l'application. Pour toute question ou demande :
[contact@ohmywind.fr](mailto:contact@ohmywind.fr).

## Évolution de cette politique

Toute modification sera publiée sur cette page, avec mise à jour de la date en tête de
document.
