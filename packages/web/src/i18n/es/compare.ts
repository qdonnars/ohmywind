// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Ningún spot que comparar",
  "compare.empty.body":
    "Guarde sus spots desde Explorar, con una pulsación larga en el mapa o un clic derecho: aparecerán aquí lado a lado.",
  "compare.empty.cta": "Explorar el mapa",

  "compare.table.empty": "No hay datos disponibles para sus spots.",
  "compare.table.offline":
    "Sin conexión: no se pueden recuperar las previsiones. Vuelva a conectarse y abra de nuevo esta página.",
  "compare.row.focus": "Centrar el mapa en {name}",
  "compare.row.open": "Abrir {name} en Explorar",
  "compare.row.noData": "Fuera de cobertura",
};
