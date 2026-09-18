// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Cargando…",
  "common.close": "Cerrar",
  "common.cancel": "Cancelar",
  "common.back": "Volver",
  "common.retry": "Reintentar",
  "common.days.one": "{count} día",
  "common.days.other": "{count} días",

  // Navigation menu
  "common.nav.open": "Abrir el menú",
  "common.nav.close": "Cerrar el menú",
  "common.nav.label": "Navegación",
  "common.nav.explore.title": "Explorar",
  "common.nav.explore.desc": "El mapa y el tiempo del spot",
  "common.nav.plan.title": "Planificar",
  "common.nav.plan.desc": "Simular una ruta, comparar ventanas",
  "common.nav.compare.title": "Comparar mis spots",
  "common.nav.compare.desc": "Mis favoritos lado a lado",

  "common.quota.connection":
    "El servicio meteorológico gratuito (Open-Meteo) ha alcanzado su límite de peticiones {window} para su conexión. {reset}",
  "common.quota.server":
    "El servicio meteorológico gratuito (Open-Meteo) ha alcanzado su límite de peticiones {window} para nuestro servidor. No tiene relación con su uso. {reset}",
  "common.quota.window.minute": "por minuto",
  "common.quota.window.hour": "por hora",
  "common.quota.window.day": "por día",
  "common.quota.reset.soon": "Se restablece en menos de un minuto.",
  "common.quota.reset.minutes.one": "Se restablece en {count} minuto.",
  "common.quota.reset.minutes.other": "Se restablece en {count} minutos.",
  "common.quota.reset.hours.one": "Se restablece en {count} hora aproximadamente.",
  "common.quota.reset.hours.other": "Se restablece en {count} horas aproximadamente.",
};
