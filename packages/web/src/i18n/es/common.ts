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
};
