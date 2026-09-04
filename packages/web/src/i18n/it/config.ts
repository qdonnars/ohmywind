// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { config as frConfig } from "../fr/config";

export const config: Record<keyof typeof frConfig, string> = {
  "config.lang.label": "Lingua",
  "config.lang.backendNote":
    "Gli avvisi calcolati dal motore di traversata restano in francese per il momento.",

  "config.header.title": "Configurazione",
  "config.reset": "Reimpostare",
  "config.saved": "· salvato",
  "config.storageNote":
    "OhMyWind non prevede volutamente account utente: nessun dato viene inviato a un server per identificare chi la utilizza. Le sue preferenze (modelli, polare personalizzata) sono memorizzate localmente nel suo browser. Se cambia dispositivo o browser, oppure se cancella i cookie di questo sito, queste impostazioni andranno perse.",

  "config.models.title": "Modelli meteo",
  "config.models.intro":
    "I primi {limit} modelli sono visualizzati nella tabella delle previsioni, in quest'ordine. Trascinare e rilasciare per riordinare (su mobile, tenere premuta una riga, oppure usare direttamente la maniglia ⋮⋮). Questa configurazione non incide sulle pianificazioni della traversata.",
  "config.models.zoneActive": "Usati nell'app",
  "config.models.zoneIgnored": "Ignorati",
  "config.models.horizonHours": "{hours} h",
  "config.models.horizonDays": "{days} gg",

  "config.models.arome.description":
    "Alta risoluzione Météo-France, coglie gli effetti termici e il riparo costiero.",
  "config.models.arome.coverage": "Francia",
  "config.models.arpegeEu.description": "Modello francese a medio termine, prolunga AROME.",
  "config.models.arpegeEu.coverage": "Europa",
  "config.models.arpegeW.description": "Pilota globale di Météo-France, bassa risoluzione.",
  "config.models.arpegeW.coverage": "Globale",
  "config.models.icon.description":
    "Modello regionale europeo, buon compromesso tra portata e precisione.",
  "config.models.icon.coverage": "Europa",
  "config.models.iconGlobal.description": "Versione globale di ICON, portata estesa.",
  "config.models.iconGlobal.coverage": "Globale",
  "config.models.iconD2.description":
    "Altissima risoluzione DWD, margini utili sulla Francia orientale.",
  "config.models.iconD2.coverage": "Germania + zone di confine",
  "config.models.ecmwf.description": "Riferimento a medio termine, risoluzione più grossolana.",
  "config.models.ecmwf.coverage": "Globale",
  "config.models.ecmwfAifs.description":
    "Modello IA di ECMWF, prestazioni vicine a quelle dell'IFS.",
  "config.models.ecmwfAifs.coverage": "Globale (IA)",
  "config.models.gfs.description":
    "Portata molto lunga, raffiche poco affidabili con vento debole.",
  "config.models.gfs.coverage": "Globale",
  "config.models.ukmo.description":
    "Modello globale del Met Office, buono sull'Atlantico settentrionale.",
  "config.models.ukmo.coverage": "Globale",
  "config.models.ukmoUk.description": "Alta risoluzione UK, utile nella Manica occidentale.",
  "config.models.ukmoUk.coverage": "Isole Britanniche + Manica",
  "config.models.gem.description": "Modello globale canadese, complemento utile.",
  "config.models.gem.coverage": "Globale",
  "config.models.dmiHarmonie.description":
    "Alta risoluzione scandinava, utile nella Manica e nel Mare del Nord.",
  "config.models.dmiHarmonie.coverage": "Europa settentrionale + Manica",
  "config.models.metnoNordic.description":
    "Modello norvegese ad altissima risoluzione sul Mare del Nord.",
  "config.models.metnoNordic.coverage": "Scandinavia + Mare del Nord",

  "config.boat.title": "Barca",
  "config.boat.intro":
    "Descrivere la propria barca: queste impostazioni alimentano tutte le pianificazioni della traversata. L'essenziale basta per iniziare bene; il riquadro Avanzato permette di importare la propria polare e di affinare il comportamento in bolina e sotto spinnaker.",
  "config.boat.resetAll": "Reimpostare tutto",

  "config.boat.archetype.cruiser20ft": "Crociera 20 piedi",
  "config.boat.archetype.cruiser25ft": "Crociera 25 piedi",
  "config.boat.archetype.cruiser30ft": "Crociera 30 piedi",
  "config.boat.archetype.cruiser40ft": "Crociera 40 piedi",
  "config.boat.archetype.cruiser50ft": "Crociera 50 piedi",
  "config.boat.archetype.racerCruiser": "Crociera-regata",
  "config.boat.archetype.catamaran40ft": "Catamarano 40 piedi",

  "config.boat.essentials.title": "Essenziale",
  "config.boat.essentials.myBoat": "La mia barca",
  "config.boat.essentials.importedActive":
    "Polare importata attiva: la scelta della barca si applica in modalità tipo di barca.",
  "config.boat.essentials.coefficient": "Coefficiente di prestazione ({percent} %)",
  "config.boat.essentials.coefficientHint":
    "Il 100 % corrisponde alla polare teorica, calcolata a barca scarica e con vele da regata: nella pratica si naviga al di sotto. Il valore predefinito è un buon punto di partenza; conviene abbassarlo se la barca è carica o le vele sono stanche.",
  "config.boat.essentials.coefficientHintImported":
    "Polare misurata sulla propria barca? In quel caso il 100 % si giustifica.",

  "config.boat.motor.legend": "Motore (opzionale)",
  "config.boat.motor.thresholdLabel": "Velocità di soglia (kn)",
  "config.boat.motor.speedLabel": "Velocità a motore (kn)",
  "config.boat.motor.thresholdPlaceholder": "es. 2",
  "config.boat.motor.speedPlaceholder": "es. 5",
  "config.boat.motor.hint":
    "Sotto la velocità di soglia calcolata dalla polare si passa a motore (fino a {max} kn). Lasciare vuoti entrambi i campi per restare al 100 % a vela (comportamento predefinito).",
  "config.boat.motor.clamped":
    "Valore riportato a {max} kn, il tetto del simulatore: oltre, la stima meteo per tratta non è più affidabile.",
  "config.boat.motor.halfSet":
    "Compilare entrambi i valori per attivare il motore. Finché è compilato un solo campo, la simulazione resta al 100 % a vela.",
  "config.boat.motor.inverted":
    "La velocità di soglia supera la velocità a motore: sulle tratte percorse tra le due, il motore rallenterebbe la barca. Verificare entrambi i valori.",

  "config.boat.advanced.title": "Avanzato",
  "config.boat.advanced.subtitle": "polare personalizzata, angolo di bolina, spinnaker",
  "config.boat.advanced.polarFile": "File della polare",
  "config.boat.advanced.importFile": "Importare un file…",
  "config.boat.advanced.replaceFile": "Sostituire il file…",
  "config.boat.advanced.removeFile": "Eliminare",
  "config.boat.advanced.activePolar": "Polare attiva",
  "config.boat.advanced.sourceImported": "Polare importata",
  "config.boat.advanced.sourceArchetype": "Tipo di barca regolato",
  "config.boat.advanced.formatHint":
    "Formato standard (qtVlm, Expedition, MaxSea): prima riga = velocità del vento (TWS), una riga per angolo (TWA), separate da tabulazioni, punti e virgola o virgole. Estensioni .pol, .csv o .txt.",
  "config.boat.advanced.exampleFile":
    "<a>Scaricare un file di esempio (.csv)</a>: la polare della crociera 30 piedi, da aprire in un foglio di calcolo e da riempire con i valori della propria barca.",
  "config.boat.advanced.minUpwind": "Angolo di bolina minimo",
  "config.boat.advanced.minUpwindPlaceholder": "auto ({deg}°)",
  "config.boat.advanced.minUpwindAuto": "Auto",
  "config.boat.advanced.minUpwindHint":
    "Al di sotto di questo angolo del vento la barca non stringe più: il simulatore bordeggia all'angolo di VMG ottimale e il diagramma ombreggia la zona morta. Auto = valore del tipo di barca ({archetype}), oppure primo angolo del file importato. Un angolo più stretto dei dati della polare prolunga la curva a VMG costante, senza migliorare le velocità simulate.",
  "config.boat.advanced.spinnaker": "Spinnaker",
  "config.boat.advanced.spiKind": "Tipo di spinnaker",
  "config.boat.advanced.spiOff": "Nessuno",
  "config.boat.advanced.spiAsymmetric": "Asimmetrico",
  "config.boat.advanced.spiAsymmetricTitle":
    "Asimmetrico: sweet spot al lasco 110-135°, utile fino a 150° in heat-up",
  "config.boat.advanced.spiSymmetric": "Simmetrico",
  "config.boat.advanced.spiSymmetricTitle":
    "Simmetrico: ottimale in poppa piena, 135-165° (tangone necessario)",
  "config.boat.advanced.spiDouse": "Ammainare sopra",
  "config.boat.advanced.spiLocked":
    "Polare importata attiva: l'impostazione dello spinnaker è bloccata, si presume che il file rifletta già il parco vele di bordo.",
  "config.boat.advanced.spiThresholdHint":
    "Il guadagno di velocità alle andature portanti si applica solo alle curve di vento inferiori o uguali a questa soglia.",
  "config.boat.advanced.tuning": "Regolazione manuale",
  "config.boat.advanced.tunedPoints": "{count} punto/i regolato/i",
  "config.boat.advanced.tuningHint":
    "Trascinare un punto della curva selezionata per fissarne la velocità (valori grezzi, prima del coefficiente). I punti regolati restano quando si cambia spinnaker.",
  "config.boat.advanced.rawSubtitle": "valori grezzi · trascinare per regolare",
  "config.boat.advanced.clearTuning": "Cancellare le regolazioni",

  "config.boat.result.title": "Polare risultante",
  "config.boat.result.tileSubtitle": "ciò che utilizzerà il pianificatore",
  "config.boat.result.subtitle":
    "polare risultante · coefficiente ×{coefficient} · bolina {upwind}°",
  "config.boat.result.spiAsymmetric": "spinnaker asimmetrico ≤ {tws} kn",
  "config.boat.result.spiSymmetric": "spinnaker simmetrico ≤ {tws} kn",

  "config.polar.curveShown": "Curva visualizzata (TWS)",
  "config.polar.curveEditable": "Curva modificabile (TWS)",
  "config.polar.diagram": "Diagramma polare: {title}",
  "config.polar.handle": "TWA {twa}° · {speed} kn",
  "config.polar.handleEditable": "TWA {twa}° · {speed} kn (trascinare per regolare)",

  "config.polarImport.defaultName": "Polare importata",
  "config.polarImport.ok": "«{name}» importata ({tws} velocità del vento × {twa} angoli).",
  "config.polarImport.tooLarge":
    "File troppo grande: una polare pesa qualche kB, verificare che sia il file giusto.",
  "config.polarImport.unreadable":
    "Impossibile leggere questo file. Formato atteso: testo con una riga di intestazione TWS, poi una riga per ogni angolo TWA.",
  "config.polarImport.errors.empty": "File vuoto: nessuna riga di dati trovata.",
  "config.polarImport.errors.badHeader":
    'Prima riga illeggibile: deve elencare le velocità del vento (TWS), per esempio "TWA\\TWS  6  8  10  12  16  20".',
  "config.polarImport.errors.badTws":
    "Riga {line}: TWS non valido «{value}» (atteso un numero tra 0 e {max} kn).",
  "config.polarImport.errors.tooFewTws": "Servono almeno 2 colonne di vento (TWS) nel file.",
  "config.polarImport.errors.tooManyTws": "Troppe colonne TWS ({count}, massimo {max}).",
  "config.polarImport.errors.badTwa":
    "Riga {line}: angolo TWA non valido «{value}» (atteso un numero tra 0 e 180°).",
  "config.polarImport.errors.speedCount":
    "Riga {line}: {found} velocità trovata/e, {expected} attesa/e (una per colonna TWS).",
  "config.polarImport.errors.badSpeed":
    "Riga {line}: velocità barca non valida «{value}» (atteso un numero ≥ 0).",
  "config.polarImport.errors.tooFewTwa": "Servono almeno 2 righe di angoli (TWA) nel file.",
  "config.polarImport.errors.tooManyTwa": "Troppe righe TWA ({count}, massimo {max}).",
  "config.polarImport.errors.duplicateTws": "Colonna TWS duplicata: {tws} kn compare due volte.",
  "config.polarImport.errors.duplicateTwa": "Riga {line}: angolo TWA duplicato ({twa}°).",
  "config.polarImport.warnings.clamped":
    "{count} velocità superiore/i a {max} kn riportata/e a {max} kn.",

  "config.docs.methodology": "Metodologia",
  "config.docs.privacy": "Privacy",

  "config.notFound.title": "Questa pagina non esiste",
  "config.notFound.body": "Forse il link è incompleto, oppure la pagina ha cambiato indirizzo.",
  "config.notFound.back": "Tornare alla mappa",

  "config.lazyPage.offlineTitle": "Questa pagina richiede una connessione.",
  "config.lazyPage.offlineBody": "Ricollegarsi e poi ricaricare, oppure tornare alla mappa.",
  "config.lazyPage.errorTitle": "Non è stato possibile visualizzare questa pagina.",
  "config.lazyPage.errorBody": "Ricaricare la pagina, oppure tornare alla mappa.",
  "config.lazyPage.reload": "Ricaricare",
  "config.lazyPage.backToMap": "Tornare alla mappa",
  "config.models.provider.meteoFrance": "Météo-France",
  "config.models.provider.dwd": "DWD (Germania)",
  "config.models.provider.ecmwf": "Centro europeo",
  "config.models.provider.noaa": "NOAA (Stati Uniti)",
  "config.models.provider.metOffice": "Met Office (UK)",
  "config.models.provider.envCanada": "Env. Canada",
  "config.models.provider.dmi": "DMI (Danimarca)",
  "config.models.provider.metNorway": "MET Norway",
};
