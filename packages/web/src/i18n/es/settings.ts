// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { settings as frSettings } from "../fr/settings";

export const settings: Record<keyof typeof frSettings, string> = {
  "settings.done": "Listo",
  "settings.group.device": "Dispositivo",
  "settings.group.map": "Mapa",
  "settings.group.forecast": "Previsiones",
  "settings.theme.label": "Tema",
  "settings.theme.auto": "Auto",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Oscuro",
  "settings.device.note": "Auto sigue el ajuste claro u oscuro del dispositivo.",
  "settings.keepAwake.subtitle": "Mientras se muestra un plan calculado",
  "settings.seamarks.label": "Balizamiento",
  "settings.seamarks.subtitle": "Boyas, balizas y faros (OpenSeaMap)",
  "settings.seamarks.always": "Siempre",
  "settings.seamarks.never": "Nunca",
  "settings.map.note": "En los dos mapas, meteo y planificador.",
  "settings.models.summary": "Tabla: {models}",
  "settings.boat.summary": "{boat} · {percent}\u00a0%",
  "settings.boat.summaryMotor": "motor por debajo de {speed}\u00a0kn",
  "settings.boat.summaryImported": "polar importada",

  // Barco: las vistas Barco, Mi barco y Avanzado.
  "settings.boat.intro":
    "Estos ajustes alimentan todas sus planificaciones de la travesía. Con lo esencial basta para empezar bien.",
  "settings.boat.types.note":
    "Cada tipo de barco tiene su polar y su ángulo de ceñida. Ajuste después el coeficiente.",
  "settings.boat.advanced.upwind": "ceñida {deg}°",
  "settings.boat.upwind.manual": "Ajustado a mano",
  "settings.boat.upwind.tighter": "Cerrar el ángulo de ceñida",
  "settings.boat.upwind.wider": "Abrir el ángulo de ceñida",
  "settings.boat.spi.lower": "Bajar el umbral para arriar",
  "settings.boat.spi.higher": "Subir el umbral para arriar",
  "settings.boat.tuning.legend":
    "Trazo discontinuo: la curva antes de sus ajustes. Puntos amarillos: puntos ajustados. Con el teclado, las flechas cambian la velocidad de un punto en {step}\u00a0kn.",
  "settings.boat.point": "Ángulo {twa}°, {speed}\u00a0kn",
  "settings.boat.pointTuned": "Ángulo {twa}°, {speed}\u00a0kn, ajustado",

  "settings.forecast.note":
    "Los modelos llenan la tabla del mapa; el barco sirve para todas sus planificaciones de la travesía.",
  "settings.storageNote":
    "OhMyWind no tiene cuentas: sus preferencias se quedan en este dispositivo. Cambiar de dispositivo o borrar los datos del sitio las hace desaparecer.",
  "settings.lang.note":
    "Cada idioma está escrito en su propio idioma, para que un lector perdido reconozca el suyo.",
};
