// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Ningún spot que comparar",
  "compare.empty.body":
    "Añada un spot desde la búsqueda, o guarde uno desde Explorar con una pulsación larga en el mapa: aparecerán aquí lado a lado.",
  "compare.none.title": "Ningún spot marcado",
  "compare.none.body": "Marque al menos un spot en la lista para leerlo aquí.",
  "compare.table.empty": "No hay datos disponibles para sus spots.",
  "compare.table.offline":
    "Sin conexión: no se pueden recuperar las previsiones. Vuelva a conectarse y abra de nuevo esta página.",

  "compare.row.focus": "Centrar el mapa en {name}",
  "compare.row.noData": "Fuera de cobertura",

  "compare.controls.resLabel": "Paso horario",
  "compare.controls.res": "{hours} h",
  "compare.controls.windPlus": "Viento +",
  "compare.controls.waves": "Olas",
  "compare.window.label": "Franja horaria",
  "compare.window.chip": "{start}–{end} h",
  "compare.window.start": "Inicio",
  "compare.window.end": "Fin",
  "compare.window.hour": "{hour}h",

  "compare.spots.chip": "Spots",
  "compare.spots.chipCount": "{picked}/{total}",
  "compare.spots.title": "Spots comparados",
  "compare.spots.checkAll": "Marcar todos",
  "compare.spots.uncheckAll": "Desmarcar todos",
  "compare.spots.add": "Añadir un spot",
  "compare.spots.toggle": "Comparar {name}",
  "compare.spots.count.one": "{count} spot",
  "compare.spots.count.other": "{count} spots",

  "compare.sheet.expand": "Desplegar la tabla",
  "compare.sheet.collapse": "Plegar la tabla",
  "compare.map.recentre": "Encuadrar el mapa en los spots",
  "compare.header.now": "Hora actual",

  "compare.cell.aria.range": "{lo} a {hi}",
  "compare.cell.aria.wind": "Viento {wind} nudos",
  "compare.cell.aria.windGusts": "Viento {wind} nudos, rachas {gusts}",
  "compare.cell.aria.windDirection": "Viento {wind} nudos, dirección {direction}°",
  "compare.cell.aria.windGustsDirection":
    "Viento {wind} nudos, rachas {gusts}, dirección {direction}°",
  "compare.cell.aria.wave": "Mar {hs} m, periodo {period} s",
  "compare.cell.aria.waveFrom": "Mar {hs} m desde {dir}°, periodo {period} s",
};
