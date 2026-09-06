// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/** La page /config (modèles météo, bateau), les pages de documentation, la
    page 404 et l'écran d'attente des pages chargées à la demande. */
export const config = {
  "config.lang.label": "Langue",
  "config.lang.backendNote":
    "Les avertissements calculés par le moteur de passage restent en français pour le moment.",

  "config.header.title": "Configuration",
  "config.reset": "Réinitialiser",
  "config.saved": "· enregistré",
  "config.storageNote":
    "OhMyWind ne propose volontairement pas de comptes utilisateurs : aucune donnée n'est envoyée sur un serveur pour identifier qui vous êtes. Vos préférences (modèles, polaire perso) sont stockées localement dans votre navigateur. Si vous changez d'appareil, de navigateur ou si vous effacez les cookies de ce site, ces ajustements seront perdus.",

  // Onglet « Modèles météo » : intro, bracket des zones, horizon.
  "config.models.title": "Modèles météo",
  "config.models.intro":
    "Les {limit} premiers modèles sont affichés dans la table de prévision, dans cet ordre. Glissez-déposez pour réordonner (sur mobile, appui maintenu sur une ligne, ou directement la poignée ⋮⋮). Cette configuration ne touche pas les plans de passage.",
  "config.models.zoneActive": "Utilisé dans l'app",
  "config.models.zoneIgnored": "Ignorés",
  "config.models.horizonHours": "{hours} h",
  "config.models.horizonDays": "{days} j",

  // Un couple description / couverture par modèle (MODEL_META y renvoie).
  "config.models.arome.description":
    "Haute résolution Météo-France, capte les effets thermiques et l'abri côtier.",
  "config.models.arome.coverage": "France",
  "config.models.arpegeEu.description": "Modèle français moyenne échéance, prolonge AROME.",
  "config.models.arpegeEu.coverage": "Europe",
  "config.models.arpegeW.description": "Pilote global de Météo-France, basse résolution.",
  "config.models.arpegeW.coverage": "Global",
  "config.models.icon.description": "Modèle régional européen, bon compromis portée / précision.",
  "config.models.icon.coverage": "Europe",
  "config.models.iconGlobal.description": "Version globale d'ICON, portée étendue.",
  "config.models.iconGlobal.coverage": "Global",
  "config.models.iconD2.description":
    "Très haute résolution DWD, marges utiles sur l'est français.",
  "config.models.iconD2.coverage": "Allemagne + frontières",
  "config.models.ecmwf.description": "Référence à moyenne échéance, résolution plus grossière.",
  "config.models.ecmwf.coverage": "Global",
  "config.models.ecmwfAifs.description": "Modèle IA d'ECMWF, performances proches de l'IFS.",
  "config.models.ecmwfAifs.coverage": "Global (IA)",
  "config.models.gfs.description": "Très longue portée, rafales peu fiables en faible vent.",
  "config.models.gfs.coverage": "Global",
  "config.models.ukmo.description": "Modèle global du Met Office, bon sur l'Atlantique nord.",
  "config.models.ukmo.coverage": "Global",
  "config.models.ukmoUk.description": "Haute résolution UK, utile sur la Manche occidentale.",
  "config.models.ukmoUk.coverage": "Îles Britanniques + Manche",
  "config.models.gem.description": "Modèle global canadien, complément utile.",
  "config.models.gem.coverage": "Global",
  "config.models.dmiHarmonie.description":
    "Haute résolution scandinave, utile en Manche et Mer du Nord.",
  "config.models.dmiHarmonie.coverage": "Europe du Nord + Manche",
  "config.models.metnoNordic.description":
    "Modèle norvégien très haute résolution sur la Mer du Nord.",
  "config.models.metnoNordic.coverage": "Scandinavie + Mer du Nord",

  // Onglet « Bateau » : intro et tuiles de réglage.
  "config.boat.title": "Bateau",
  "config.boat.intro":
    "Décrivez votre bateau : ces réglages nourrissent tous vos plans de passage. L'essentiel suffit pour bien commencer ; la tuile Avancé permet d'importer votre propre polaire et d'affiner le comportement au près et sous spi.",
  "config.boat.resetAll": "Tout réinitialiser",

  // Les archétypes livrés avec l'app (polarConfig.ARCHETYPE_LABELS).
  "config.boat.archetype.cruiser20ft": "Croiseur 20 pieds",
  "config.boat.archetype.cruiser25ft": "Croiseur 25 pieds",
  "config.boat.archetype.cruiser30ft": "Croiseur 30 pieds",
  "config.boat.archetype.cruiser40ft": "Croiseur 40 pieds",
  "config.boat.archetype.cruiser50ft": "Croiseur 50 pieds",
  "config.boat.archetype.racerCruiser": "Racer-cruiser",
  "config.boat.archetype.catamaran40ft": "Catamaran 40 pieds",

  // Tuile « Essentiel ».
  "config.boat.essentials.title": "Essentiel",
  "config.boat.essentials.myBoat": "Mon bateau",
  "config.boat.essentials.importedActive":
    "Polaire importée active : le choix du bateau s'applique en mode archétype.",
  "config.boat.essentials.coefficient": "Coefficient de performance ({percent} %)",
  "config.boat.essentials.coefficientHint":
    "Les 100 % correspondent à la polaire théorique, calculée bateau à vide avec des voiles de course : en pratique on navigue en dessous. La valeur par défaut est un bon point de départ ; baissez-la si le bateau est chargé ou les voiles fatiguées.",
  "config.boat.essentials.coefficientHintImported":
    "Polaire mesurée sur votre propre bateau ? Là, 100 % se justifie.",

  // Moteur, dans la tuile « Essentiel ».
  "config.boat.motor.legend": "Moteur (optionnel)",
  "config.boat.motor.thresholdLabel": "Vitesse seuil (kn)",
  "config.boat.motor.speedLabel": "Vitesse moteur (kn)",
  "config.boat.motor.thresholdPlaceholder": "ex. 2",
  "config.boat.motor.speedPlaceholder": "ex. 5",
  // Espaces insécables avant kn et %, comme les &nbsp; du JSX d'origine.
  "config.boat.motor.hint":
    "Sous la vitesse seuil calculée par la polaire, on bascule au moteur (jusqu'à {max} kn). Laissez les deux champs vides pour rester 100 % voile (comportement par défaut).",
  "config.boat.motor.clamped":
    "Valeur ramenée à {max} kn, le plafond du simulateur : au-delà, l'estimation météo par tronçon n'est plus fiable.",
  "config.boat.motor.halfSet":
    "Renseignez les deux valeurs pour activer le moteur. Tant qu'un seul champ est rempli, la simulation reste 100 % voile.",
  "config.boat.motor.inverted":
    "La vitesse seuil dépasse la vitesse moteur : sur les tronçons naviguant entre les deux, le moteur ralentirait le bateau. Vérifiez les deux valeurs.",

  // Tuile « Avancé » : import de fichier, angle de près, spi, ajustement.
  "config.boat.advanced.title": "Avancé",
  "config.boat.advanced.subtitle": "polaire perso, angle de près, spi",
  "config.boat.advanced.polarFile": "Fichier de polaire",
  "config.boat.advanced.importFile": "Importer un fichier…",
  "config.boat.advanced.replaceFile": "Remplacer le fichier…",
  "config.boat.advanced.removeFile": "Supprimer",
  "config.boat.advanced.activePolar": "Polaire active",
  "config.boat.advanced.sourceImported": "Polaire importée",
  "config.boat.advanced.sourceArchetype": "Archétype ajusté",
  "config.boat.advanced.formatHint":
    "Format standard (qtVlm, Expedition, MaxSea) : première ligne = vitesses de vent (TWS), une ligne par angle (TWA), séparées par tabulations, points-virgules ou virgules. Extensions .pol, .csv ou .txt.",
  "config.boat.advanced.exampleFile":
    "<a>Télécharger un fichier d'exemple (.csv)</a> : la polaire du croiseur 30 pieds, à ouvrir dans un tableur et remplacer par les valeurs de votre bateau.",
  "config.boat.advanced.minUpwind": "Angle de près minimal",
  "config.boat.advanced.minUpwindPlaceholder": "auto ({deg}°)",
  "config.boat.advanced.minUpwindAuto": "Auto",
  "config.boat.advanced.minUpwindHint":
    "En dessous de cet angle du vent, le bateau ne remonte plus : le simulateur tire des bords à l'angle de VMG optimal et le diagramme grise la zone morte. Auto = valeur de l'archétype ({archetype}), ou premier angle du fichier importé. Un angle plus serré que les données de la polaire prolonge la courbe à VMG constant, sans améliorer les vitesses simulées.",
  "config.boat.advanced.spinnaker": "Spinnaker",
  "config.boat.advanced.spiKind": "Type de spi",
  "config.boat.advanced.spiOff": "Aucun",
  "config.boat.advanced.spiAsymmetric": "Asymétrique",
  "config.boat.advanced.spiAsymmetricTitle":
    "Asymétrique : sweet spot reaching 110-135°, utile jusqu'à 150° en heat-up",
  "config.boat.advanced.spiSymmetric": "Symétrique",
  "config.boat.advanced.spiSymmetricTitle":
    "Symétrique : optimal au plein-vent arrière, 135-165° (pole requis)",
  "config.boat.advanced.spiDouse": "Affaler au-dessus de",
  "config.boat.advanced.spiLocked":
    "Polaire importée active : le réglage spi est verrouillé, votre fichier est supposé refléter déjà votre garde-robe de voiles.",
  "config.boat.advanced.spiThresholdHint":
    "Le gain de vitesse au portant ne s'applique qu'aux courbes de vent inférieures ou égales à ce seuil.",
  "config.boat.advanced.tuning": "Ajustement manuel",
  "config.boat.advanced.tunedPoints": "{count} point(s) ajusté(s)",
  "config.boat.advanced.tuningHint":
    "Glissez un point de la courbe sélectionnée pour fixer sa vitesse (valeurs brutes, avant coefficient). Les points ajustés restent quand vous changez de spi.",
  "config.boat.advanced.rawSubtitle": "valeurs brutes · glisser pour ajuster",
  "config.boat.advanced.clearTuning": "Effacer les ajustements",

  // Tuile « Polaire résultante ».
  "config.boat.result.title": "Polaire résultante",
  "config.boat.result.tileSubtitle": "ce que le planificateur utilisera",
  "config.boat.result.subtitle": "polaire résultante · coefficient ×{coefficient} · près {upwind}°",
  "config.boat.result.spiAsymmetric": "spi asymétrique ≤ {tws} kn",
  "config.boat.result.spiSymmetric": "spi symétrique ≤ {tws} kn",

  // Diagramme polaire, partagé par les deux tuiles.
  "config.polar.curveShown": "Courbe affichée (TWS)",
  "config.polar.curveEditable": "Courbe éditable (TWS)",
  "config.polar.diagram": "Diagramme polaire : {title}",
  "config.polar.handle": "TWA {twa}° · {speed} kn",
  "config.polar.handleEditable": "TWA {twa}° · {speed} kn (glisser pour ajuster)",

  // Import d'un fichier de polaire : ce que l'utilisateur lit en retour.
  "config.polarImport.defaultName": "Polaire importée",
  "config.polarImport.ok": "« {name} » importée ({tws} vitesses de vent × {twa} angles).",
  "config.polarImport.tooLarge":
    "Fichier trop volumineux : une polaire fait quelques ko, vérifiez que c'est le bon fichier.",
  "config.polarImport.unreadable":
    "Impossible de lire ce fichier. Format attendu : texte avec une ligne d'en-tête TWS puis une ligne par angle TWA.",
  "config.polarImport.errors.empty": "Fichier vide : aucune ligne de données trouvée.",
  "config.polarImport.errors.badHeader":
    'Première ligne illisible : elle doit lister les vitesses de vent (TWS), par exemple "TWA\\TWS  6  8  10  12  16  20".',
  "config.polarImport.errors.badTws":
    "Ligne {line} : TWS invalide « {value} » (attendu un nombre entre 0 et {max} kn).",
  "config.polarImport.errors.tooFewTws": "Il faut au moins 2 colonnes de vent (TWS) dans le fichier.",
  "config.polarImport.errors.tooManyTws": "Trop de colonnes TWS ({count}, maximum {max}).",
  "config.polarImport.errors.badTwa":
    "Ligne {line} : angle TWA invalide « {value} » (attendu un nombre entre 0 et 180°).",
  "config.polarImport.errors.speedCount":
    "Ligne {line} : {found} vitesse(s) trouvée(s), {expected} attendue(s) (une par colonne TWS).",
  "config.polarImport.errors.badSpeed":
    "Ligne {line} : vitesse bateau invalide « {value} » (attendu un nombre ≥ 0).",
  "config.polarImport.errors.tooFewTwa": "Il faut au moins 2 lignes d'angles (TWA) dans le fichier.",
  "config.polarImport.errors.tooManyTwa": "Trop de lignes TWA ({count}, maximum {max}).",
  "config.polarImport.errors.duplicateTws": "Colonne TWS en double : {tws} kn apparaît deux fois.",
  "config.polarImport.errors.duplicateTwa": "Ligne {line} : angle TWA en double ({twa}°).",
  "config.polarImport.warnings.clamped":
    "{count} vitesse(s) supérieure(s) à {max} kn ramenée(s) à {max} kn.",

  // Pages de documentation : seul l'habillage est traduit, le markdown aura
  // ses propres fichiers par langue.
  "config.docs.methodology": "Méthodologie",
  "config.docs.privacy": "Confidentialité",

  // Aucune route ne correspond.
  "config.notFound.title": "Cette page n'existe pas",
  "config.notFound.body": "Le lien est peut-être incomplet, ou la page a changé d'adresse.",
  "config.notFound.back": "Retour à la carte",

  // Le chunk d'une page de documentation n'est jamais arrivé.
  "config.lazyPage.offlineTitle": "Cette page nécessite une connexion.",
  "config.lazyPage.offlineBody": "Reconnectez-vous puis rechargez, ou revenez à la carte.",
  "config.lazyPage.errorTitle": "Cette page n'a pas pu s'afficher.",
  "config.lazyPage.errorBody": "Rechargez la page, ou revenez à la carte.",
  "config.lazyPage.reload": "Recharger",
  "config.lazyPage.backToMap": "Revenir à la carte",
  "config.models.provider.meteoFrance": "Météo-France",
  "config.models.provider.dwd": "DWD (Allemagne)",
  "config.models.provider.ecmwf": "Centre européen",
  "config.models.provider.noaa": "NOAA (États-Unis)",
  "config.models.provider.metOffice": "Met Office (UK)",
  "config.models.provider.envCanada": "Env. Canada",
  "config.models.provider.dmi": "DMI (Danemark)",
  "config.models.provider.metNorway": "MET Norway",
} as const;
