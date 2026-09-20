// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "URL no válida",
  "plan.page.urlError.back": "← Explorar la meteorología",
  "plan.page.hint.placeStart": "Haga clic para situar la salida",
  "plan.page.hint.drawRoute": "Haga clic para trazar su ruta",
  "plan.panel.resize": "Redimensionar el panel",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distancia",
  "plan.hero.duration": "Duración",
  "plan.hero.arrival": "Llegada",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Pasos de la travesía, un clic abre el paso",
  "plan.segmentBar.progressLabel": "Distribución del viento por segmento",
  "plan.segmentBar.stepLabel":
    "Tramo {from}→{to}, paso {index} de {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Trace su trayecto",
  "plan.states.empty.body":
    "Haga clic en el mapa para colocar una salida y una llegada. Después podrá calcular el paso y luego comparar otras salidas u otras rutas.",
  "plan.states.error.title": "Error",
  "plan.states.waking.title": "El servidor meteorológico se está reactivando",
  "plan.states.waking.body":
    "Estaba en reposo: el cálculo se reanuda solo en {seconds} s (intento {attempt} de {max}).",
  "plan.states.waking.retryNow": "Reintentar ahora",
  "plan.recap.edit": "Modificar",

  // ── Mode picker and time anchor ───────────────────────────────────────────
  "plan.timeAnchor.tablist": "Anclaje horario",
  "plan.timeAnchor.departure.title": "Definir la salida",
  "plan.timeAnchor.departure.sub": "Entender la duración del trayecto",
  "plan.timeAnchor.arrival.title": "Definir la llegada",
  "plan.timeAnchor.arrival.sub": "¿Cuándo salir como muy tarde?",

  // ── Steps of a leg ────────────────────────────────────────────────────────
  "plan.steps.groupLabel": "Pasos de cálculo del tramo",
  "plan.steps.stepLabel": "Paso {index} de {total}, {time}",
  "plan.steps.viewToggle.label": "Visualización del tramo",
  "plan.steps.viewToggle.average": "Media",
  "plan.steps.viewToggle.detail": "Detalle",

  // ── Map ───────────────────────────────────────────────────────────────────
  "plan.map.waypoint.remove": "Eliminar este punto",
  "plan.map.waypoint.removed": "Punto {n} eliminado",
  "plan.map.waypoint.undo": "Deshacer",

  // ── Comparison window validation ──────────────────────────────────────────
  "plan.sweep.errors.missingWindow": "Indique una ventana de salida.",
  "plan.sweep.errors.invalidDates": "Fechas no válidas.",
  "plan.sweep.errors.latestBeforeEarliest": "El «más tarde» debe ser posterior al «más pronto».",
  "plan.sweep.errors.beyondHorizon":
    "La previsión solo es fiable a {days} días. Elija una fecha anterior.",
  "plan.sweep.errors.tooManyWindows":
    "Demasiadas ventanas que comparar ({windows}). Reduzca la ventana o aumente el paso.",

  // ── URL parsing ───────────────────────────────────────────────────────────
  "plan.url.errors.tooFewWaypoints": "Se requieren al menos 2 waypoints",
  "plan.url.errors.invalidWaypoint": 'waypoint no válido: "{value}"',
  "plan.url.errors.latitudeOutOfRange": "latitud fuera de rango: {value}",
  "plan.url.errors.longitudeOutOfRange": "longitud fuera de rango: {value}",
  "plan.url.errors.invalidWaypoints": "Waypoints no válidos: {detail}",

  // ── Passage API errors ────────────────────────────────────────────────────
  "plan.api.errors.retryDelay.vague": "Espere unos minutos antes de volver a lanzar el cálculo.",
  "plan.api.errors.retryDelay.seconds.one":
    "Espere {count} segundo antes de volver a lanzar el cálculo.",
  "plan.api.errors.retryDelay.seconds.other":
    "Espere {count} segundos antes de volver a lanzar el cálculo.",
  "plan.api.errors.retryDelay.minutes.one":
    "Espere {count} minuto antes de volver a lanzar el cálculo.",
  "plan.api.errors.retryDelay.minutes.other":
    "Espere {count} minutos antes de volver a lanzar el cálculo.",
  "plan.api.errors.serverStatus": "Error del servidor {status}",
  "plan.api.errors.forecastHorizon":
    "El servicio meteorológico no ha podido cubrir este periodo. Elija una fecha más próxima (hasta unos 10 días según el modelo). Para conservar su planificación, no recargue la página mientras no haya ajustado la fecha.",
  "plan.api.errors.tooFewWaypoints":
    "Sitúe al menos 2 waypoints en el mapa para calcular una ruta.",
  "plan.api.errors.waypointOutOfRange":
    "Un waypoint está fuera de las coordenadas válidas. Vuelva a situarlo en el mapa.",
  "plan.api.errors.tooManyWaypoints":
    "Demasiados waypoints en esta ruta. Quite algunos para simplificarla.",
  "plan.api.errors.rateLimited": "Demasiados cálculos lanzados uno tras otro. {delay}",
  "plan.api.errors.unknownArchetype":
    "Tipo de barco desconocido. Seleccione un tipo de barco de la lista.",
  "plan.api.errors.invalidDatetime":
    "Fecha no válida. Compruebe el formato de los campos de fecha.",
  "plan.api.errors.naiveDatetime": "La hora de llegada debe incluir la zona horaria.",
  "plan.api.errors.sweepTooLarge":
    "Demasiadas ventanas que comparar. Reduzca la ventana o aumente el paso de muestreo.",
  "plan.api.errors.upstreamTimeout":
    "El servicio meteorológico ha tardado demasiado en responder. Inténtelo de nuevo dentro de unos instantes.",
  "plan.api.errors.upstreamRateLimited":
    "El servicio meteorológico limita temporalmente nuestras peticiones. No tiene que ver con su uso, inténtelo de nuevo dentro de unos minutos.",
  "plan.api.errors.upstreamUnavailable":
    "El servidor está momentáneamente inaccesible, puede que se esté reiniciando. {delay}",
  "plan.api.errors.bodyTooLarge":
    "La ruta es demasiado detallada para enviarla. Quite algunos waypoints o acorte el periodo.",
  "plan.api.errors.invalidForecastCache":
    "Los datos meteorológicos preparados por el navegador han sido rechazados. Inténtelo de nuevo: el cálculo partirá de los datos del servidor.",
  "plan.api.errors.serverUnavailable":
    "El servidor meteorológico no está disponible. Inténtelo de nuevo dentro de unos instantes.",
  "plan.api.errors.networkUnreachable":
    "No se puede contactar con el servidor. Compruebe su conexión y vuelva a intentarlo.",
  "plan.api.errors.invalidResponse":
    "El servidor ha devuelto una respuesta inesperada. Inténtelo de nuevo dentro de unos instantes.",
  "plan.notice.passage.long_route":
    "ruta larga ({route_nm} nm): {points} puntos meteorológicos muestreados (~{spacing_nm} nm entre puntos) en lugar de {requested_nm} nm, para limitar las peticiones a la API.",
  "plan.notice.passage.light_wind":
    "viento flojo: velocidad mínima {min_speed_kn} kn, travesía muy lenta",
  "plan.notice.passage.model_fallback":
    "modelo {model} sin datos en {fallback_count}/{total} puntos (probablemente fuera de cobertura); recurso automático a {others}",
  "plan.notice.currents.tidal_gap": "Corrientes de marea probablemente fuertes ({zones}) y no resueltas por nuestras fuentes: las corrientes indicadas provienen de una malla de 2 a 8 km que no las ve. Trabajamos para ampliar la cobertura, pero no todos los datos son de libre acceso.",
  "plan.notice.complexity.wind.3": "Viento fresco: TWS {tws_range} kn en {nm} nm",
  "plan.notice.complexity.wind.4": "Viento fuerte: TWS {tws_range} kn en {nm} nm",
  "plan.notice.complexity.wind.5": "Viento muy fuerte: TWS {tws_range} kn en {nm} nm",
  "plan.notice.complexity.sea.3": "Marejada: Hs {hs_range} m en {nm} nm",
  "plan.notice.complexity.sea.4": "Fuerte marejada: Hs {hs_range} m en {nm} nm",
  "plan.notice.complexity.sea.5": "Mar gruesa: Hs {hs_range} m en {nm} nm",
  "plan.notice.complexity.current":
    "Viento contra corriente: corriente contraria de {current_range} kt en {nm} nm, mar corta probable",
  "plan.notice.complexity.chop_short":
    "Mar corta: Hs {hs_range} m a Tp {tp_range} s en {nm} nm, mar incómoda",
  "plan.notice.complexity.chop_following":
    "Mar corta de popa: Hs {hs_range} m a Tp {tp_range} s en {nm} nm",
  "plan.notice.sweep.widened_interval":
    "muestreo ampliado a {effective_h} h (en lugar de {requested_h} h): la ruta cuenta {segments} tramos, demasiados para simular tantas franjas.",
  "plan.notice.sweep.skipped_windows":
    "{skipped} franja(s) omitida(s) por falta de cobertura meteorológica (horizonte superado): se muestran las {kept} restantes.",
  "plan.notice.sweep.no_window_near_eta":
    "ninguna franja llega dentro de ±2 h de target_eta={target_eta}; se devuelven las {count} franjas",
};
