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
  "settings.forecast.note":
    "Los modelos llenan la tabla del mapa; el barco sirve para todas sus planificaciones de la travesía.",
  "settings.storageNote":
    "OhMyWind no tiene cuentas: sus preferencias se quedan en este dispositivo. Cambiar de dispositivo o borrar los datos del sitio las hace desaparecer.",
  "settings.lang.note":
    "Cada idioma está escrito en su propio idioma, para que un lector perdido reconozca el suyo.",
};
