// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { config as frConfig } from "../fr/config";

export const config: Record<keyof typeof frConfig, string> = {
  "config.lang.label": "Idioma",
  "config.lang.backendNote":
    "Los avisos calculados por el motor de travesía siguen en francés por el momento.",

  "config.header.title": "Configuración",
  "config.reset": "Restablecer",
  "config.saved": "· guardado",
  "config.storageNote":
    "OhMyWind no ofrece cuentas de usuario de forma deliberada: no se envía ningún dato a un servidor para identificar quién es usted. Sus preferencias (modelos, polar personalizada) se guardan localmente en su navegador. Si cambia de dispositivo o de navegador, o si borra las cookies de este sitio, esos ajustes se perderán.",

  "config.models.title": "Modelos meteorológicos",
  "config.models.intro":
    "Los {limit} primeros modelos se muestran en la tabla de previsiones, en este orden. Arrastre y suelte para reordenar (en móvil, mantenga pulsada una fila, o use directamente el tirador ⋮⋮). Esta configuración no afecta a las planificaciones de la travesía.",
  "config.models.zoneActive": "Usados en la app",
  "config.models.zoneIgnored": "Ignorados",
  "config.models.horizonHours": "{hours} h",
  "config.models.horizonDays": "{days} d",

  "config.models.arome.description":
    "Alta resolución de Météo-France, capta los efectos térmicos y el abrigo costero.",
  "config.models.arome.coverage": "Francia",
  "config.models.arpegeEu.description": "Modelo francés de medio plazo, prolonga AROME.",
  "config.models.arpegeEu.coverage": "Europa",
  "config.models.arpegeW.description": "Modelo global rector de Météo-France, baja resolución.",
  "config.models.arpegeW.coverage": "Global",
  "config.models.icon.description":
    "Modelo regional europeo, buen compromiso entre alcance y precisión.",
  "config.models.icon.coverage": "Europa",
  "config.models.iconGlobal.description": "Versión global de ICON, alcance ampliado.",
  "config.models.iconGlobal.coverage": "Global",
  "config.models.iconD2.description":
    "Muy alta resolución del DWD, márgenes útiles sobre el este de Francia.",
  "config.models.iconD2.coverage": "Alemania + fronteras",
  "config.models.ecmwf.description": "Referencia a medio plazo, resolución más gruesa.",
  "config.models.ecmwf.coverage": "Global",
  "config.models.ecmwfAifs.description":
    "Modelo de IA de ECMWF, prestaciones cercanas a las del IFS.",
  "config.models.ecmwfAifs.coverage": "Global (IA)",
  "config.models.gfs.description": "Alcance muy largo, rachas poco fiables con viento flojo.",
  "config.models.gfs.coverage": "Global",
  "config.models.ukmo.description": "Modelo global del Met Office, bueno en el Atlántico Norte.",
  "config.models.ukmo.coverage": "Global",
  "config.models.ukmoUk.description":
    "Alta resolución del Reino Unido, útil en el Canal de la Mancha occidental.",
  "config.models.ukmoUk.coverage": "Islas Británicas + Canal de la Mancha",
  "config.models.gem.description": "Modelo global canadiense, complemento útil.",
  "config.models.gem.coverage": "Global",
  "config.models.dmiHarmonie.description":
    "Alta resolución escandinava, útil en el Canal de la Mancha y el mar del Norte.",
  "config.models.dmiHarmonie.coverage": "Europa del Norte + Canal de la Mancha",
  "config.models.metnoNordic.description":
    "Modelo noruego de muy alta resolución sobre el mar del Norte.",
  "config.models.metnoNordic.coverage": "Escandinavia + mar del Norte",

  "config.boat.title": "Barco",
  "config.boat.intro":
    "Describa su barco: estos ajustes alimentan todas sus planificaciones de la travesía. Con lo esencial basta para empezar bien; el bloque Avanzado permite importar su propia polar y afinar el comportamiento en ceñida y con spinnaker.",
  "config.boat.resetAll": "Restablecer todo",

  "config.boat.archetype.cruiser20ft": "Crucero de 20 pies",
  "config.boat.archetype.cruiser25ft": "Crucero de 25 pies",
  "config.boat.archetype.cruiser30ft": "Crucero de 30 pies",
  "config.boat.archetype.cruiser40ft": "Crucero de 40 pies",
  "config.boat.archetype.cruiser50ft": "Crucero de 50 pies",
  "config.boat.archetype.racerCruiser": "Crucero-regata",
  "config.boat.archetype.catamaran40ft": "Catamarán de 40 pies",

  "config.boat.essentials.title": "Esencial",
  "config.boat.essentials.myBoat": "Mi barco",
  "config.boat.essentials.importedActive":
    "Polar importada activa: la elección del barco se aplica en modo tipo de barco.",
  "config.boat.essentials.coefficient": "Coeficiente de rendimiento ({percent} %)",
  "config.boat.essentials.coefficientHint":
    "El 100 % corresponde a la polar teórica, calculada con el barco vacío y velas de regata: en la práctica se navega por debajo. El valor por defecto es un buen punto de partida; bájelo si el barco va cargado o las velas están cansadas.",
  "config.boat.essentials.coefficientHintImported":
    "¿Polar medida en su propio barco? En ese caso, el 100 % se justifica.",

  "config.boat.motor.legend": "Motor (opcional)",
  "config.boat.motor.thresholdLabel": "Velocidad umbral (kn)",
  "config.boat.motor.speedLabel": "Velocidad a motor (kn)",
  "config.boat.motor.thresholdPlaceholder": "ej. 2",
  "config.boat.motor.speedPlaceholder": "ej. 5",
  "config.boat.motor.hint":
    "Por debajo de la velocidad umbral calculada por la polar, se pasa a motor (hasta {max} kn). Deje ambos campos vacíos para navegar 100 % a vela (comportamiento por defecto).",
  "config.boat.motor.clamped":
    "Valor limitado a {max} kn, el tope del simulador: por encima, la estimación meteorológica por tramo deja de ser fiable.",
  "config.boat.motor.halfSet":
    "Rellene ambos valores para activar el motor. Mientras solo haya un campo relleno, la simulación sigue siendo 100 % a vela.",
  "config.boat.motor.inverted":
    "La velocidad umbral supera la velocidad a motor: en los tramos navegados entre ambas, el motor frenaría el barco. Compruebe ambos valores.",

  "config.boat.advanced.title": "Avanzado",
  "config.boat.advanced.subtitle": "polar personalizada, ángulo de ceñida, spinnaker",
  "config.boat.advanced.polarFile": "Archivo de polar",
  "config.boat.advanced.importFile": "Importar un archivo…",
  "config.boat.advanced.replaceFile": "Sustituir el archivo…",
  "config.boat.advanced.removeFile": "Eliminar",
  "config.boat.advanced.activePolar": "Polar activa",
  "config.boat.advanced.sourceImported": "Polar importada",
  "config.boat.advanced.sourceArchetype": "Tipo de barco ajustado",
  "config.boat.advanced.formatHint":
    "Formato estándar (qtVlm, Expedition, MaxSea): primera línea = velocidades de viento (TWS), una línea por ángulo (TWA), separadas por tabulaciones, puntos y coma o comas. Extensiones .pol, .csv o .txt.",
  "config.boat.advanced.exampleFile":
    "<a>Descargar un archivo de ejemplo (.csv)</a>: la polar del crucero de 30 pies, para abrir en una hoja de cálculo y sustituir por los valores de su barco.",
  "config.boat.advanced.minUpwind": "Ángulo de ceñida mínimo",
  "config.boat.advanced.minUpwindPlaceholder": "auto ({deg}°)",
  "config.boat.advanced.minUpwindAuto": "Auto",
  "config.boat.advanced.minUpwindHint":
    "Por debajo de este ángulo del viento, el barco ya no ciñe: el simulador da bordos al ángulo de VMG óptimo y el diagrama grisea la zona muerta. Auto = valor del tipo de barco ({archetype}), o primer ángulo del archivo importado. Un ángulo más cerrado que los datos de la polar prolonga la curva a VMG constante, sin mejorar las velocidades simuladas.",
  "config.boat.advanced.spinnaker": "Spinnaker",
  "config.boat.advanced.spiKind": "Tipo de spinnaker",
  "config.boat.advanced.spiOff": "Ninguno",
  "config.boat.advanced.spiAsymmetric": "Asimétrico",
  "config.boat.advanced.spiAsymmetricTitle":
    "Asimétrico: sweet spot en largo 110-135°, útil hasta 150° en heat-up",
  "config.boat.advanced.spiSymmetric": "Simétrico",
  "config.boat.advanced.spiSymmetricTitle":
    "Simétrico: óptimo en popa cerrada, 135-165° (tangón necesario)",
  "config.boat.advanced.spiDouse": "Arriar por encima de",
  "config.boat.advanced.spiLocked":
    "Polar importada activa: el ajuste del spinnaker está bloqueado, se supone que su archivo ya refleja su juego de velas.",
  "config.boat.advanced.spiThresholdHint":
    "La ganancia de velocidad en rumbos portantes solo se aplica a las curvas de viento inferiores o iguales a este umbral.",
  "config.boat.advanced.tuning": "Ajuste manual",
  "config.boat.advanced.tunedPoints": "{count} punto(s) ajustado(s)",
  "config.boat.advanced.tuningHint":
    "Arrastre un punto de la curva seleccionada para fijar su velocidad (valores brutos, antes del coeficiente). Los puntos ajustados se mantienen al cambiar de spinnaker.",
  "config.boat.advanced.rawSubtitle": "valores brutos · arrastre para ajustar",
  "config.boat.advanced.clearTuning": "Borrar los ajustes",

  "config.boat.result.title": "Polar resultante",
  "config.boat.result.tileSubtitle": "lo que usará el planificador",
  "config.boat.result.subtitle": "polar resultante · coeficiente ×{coefficient} · ceñida {upwind}°",
  "config.boat.result.spiAsymmetric": "spinnaker asimétrico ≤ {tws} kn",
  "config.boat.result.spiSymmetric": "spinnaker simétrico ≤ {tws} kn",

  "config.polar.curveShown": "Curva mostrada (TWS)",
  "config.polar.curveEditable": "Curva editable (TWS)",
  "config.polar.diagram": "Diagrama polar: {title}",
  "config.polar.handle": "TWA {twa}° · {speed} kn",
  "config.polar.handleEditable": "TWA {twa}° · {speed} kn (arrastre para ajustar)",

  "config.polarImport.defaultName": "Polar importada",
  "config.polarImport.ok": "«{name}» importada ({tws} velocidades de viento × {twa} ángulos).",
  "config.polarImport.tooLarge":
    "Archivo demasiado grande: una polar pesa unos pocos kB, compruebe que es el archivo correcto.",
  "config.polarImport.unreadable":
    "No se puede leer este archivo. Formato esperado: texto con una línea de encabezado TWS y luego una línea por cada ángulo TWA.",
  "config.polarImport.errors.empty": "Archivo vacío: no se ha encontrado ninguna línea de datos.",
  "config.polarImport.errors.badHeader":
    'Primera línea ilegible: debe enumerar las velocidades de viento (TWS), por ejemplo "TWA\\TWS  6  8  10  12  16  20".',
  "config.polarImport.errors.badTws":
    "Línea {line}: TWS no válido «{value}» (se espera un número entre 0 y {max} kn).",
  "config.polarImport.errors.tooFewTws":
    "Hacen falta al menos 2 columnas de viento (TWS) en el archivo.",
  "config.polarImport.errors.tooManyTws": "Demasiadas columnas TWS ({count}, máximo {max}).",
  "config.polarImport.errors.badTwa":
    "Línea {line}: ángulo TWA no válido «{value}» (se espera un número entre 0 y 180°).",
  "config.polarImport.errors.speedCount":
    "Línea {line}: {found} velocidad(es) encontrada(s), {expected} esperada(s) (una por columna TWS).",
  "config.polarImport.errors.badSpeed":
    "Línea {line}: velocidad del barco no válida «{value}» (se espera un número ≥ 0).",
  "config.polarImport.errors.tooFewTwa":
    "Hacen falta al menos 2 líneas de ángulos (TWA) en el archivo.",
  "config.polarImport.errors.tooManyTwa": "Demasiadas líneas TWA ({count}, máximo {max}).",
  "config.polarImport.errors.duplicateTws": "Columna TWS duplicada: {tws} kn aparece dos veces.",
  "config.polarImport.errors.duplicateTwa": "Línea {line}: ángulo TWA duplicado ({twa}°).",
  "config.polarImport.warnings.clamped":
    "{count} velocidad(es) superior(es) a {max} kn limitada(s) a {max} kn.",

  "config.docs.methodology": "Metodología",
  "config.docs.privacy": "Privacidad",

  "config.notFound.title": "Esta página no existe",
  "config.notFound.body":
    "Puede que el enlace esté incompleto, o que la página haya cambiado de dirección.",
  "config.notFound.back": "Volver al mapa",

  "config.lazyPage.offlineTitle": "Esta página necesita conexión.",
  "config.lazyPage.offlineBody": "Vuelva a conectarse y recargue, o regrese al mapa.",
  "config.lazyPage.errorTitle": "No se ha podido mostrar esta página.",
  "config.lazyPage.errorBody": "Recargue la página, o regrese al mapa.",
  "config.lazyPage.reload": "Recargar",
  "config.lazyPage.backToMap": "Volver al mapa",
  "config.models.provider.meteoFrance": "Météo-France",
  "config.models.provider.dwd": "DWD (Alemania)",
  "config.models.provider.ecmwf": "Centro europeo",
  "config.models.provider.noaa": "NOAA (Estados Unidos)",
  "config.models.provider.metOffice": "Met Office (UK)",
  "config.models.provider.envCanada": "Env. Canada",
  "config.models.provider.dmi": "DMI (Dinamarca)",
  "config.models.provider.metNorway": "MET Norway",
};
