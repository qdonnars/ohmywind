// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Nessuno spot da confrontare",
  "compare.empty.body":
    "Aggiungete uno spot dalla ricerca, o salvatene uno da Esplorare con una pressione prolungata sulla mappa: appariranno qui fianco a fianco.",
  "compare.none.title": "Nessuno spot selezionato",
  "compare.none.body": "Selezionate almeno uno spot nell'elenco per leggerlo qui.",
  "compare.table.empty": "Nessun dato disponibile per i vostri spot.",
  "compare.table.offline":
    "Offline: impossibile recuperare le previsioni. Riconnettetevi e riaprite questa pagina.",

  "compare.row.focus": "Centrare la mappa su {name}",
  "compare.row.noData": "Fuori copertura",

  "compare.controls.resLabel": "Passo orario",
  "compare.controls.res": "{hours} h",
  "compare.controls.waves": "Onde",
  "compare.window.label": "Finestra oraria",
  "compare.window.chip": "{start}–{end} h",
  "compare.window.start": "Inizio",
  "compare.window.end": "Fine",
  "compare.window.hour": "{hour}h",

  "compare.spots.chip": "Spot",
  "compare.spots.chipCount": "{picked}/{total}",
  "compare.spots.title": "Spot confrontati",
  "compare.spots.checkAll": "Seleziona tutti",
  "compare.spots.uncheckAll": "Deseleziona tutti",
  "compare.spots.add": "Aggiungere uno spot",
  "compare.spots.toggle": "Confrontare {name}",
  "compare.spots.count.one": "{count} spot",
  "compare.spots.count.other": "{count} spot",

  "compare.sheet.expand": "Aprire la tabella",
  "compare.sheet.collapse": "Chiudere la tabella",
  "compare.map.recentre": "Inquadrare la mappa sugli spot",
  "compare.header.now": "Ora attuale",

  "compare.cell.aria.range": "da {lo} a {hi}",
  "compare.cell.aria.wind": "Vento {wind} nodi",
  "compare.cell.aria.windGusts": "Vento {wind} nodi, raffiche {gusts}",
  "compare.cell.aria.windDirection": "Vento {wind} nodi, direzione {direction}°",
  "compare.cell.aria.windGustsDirection":
    "Vento {wind} nodi, raffiche {gusts}, direzione {direction}°",
  "compare.cell.aria.wave": "Mare {hs} m, periodo {period} s",
  "compare.cell.aria.waveFrom": "Mare {hs} m da {dir}°, periodo {period} s",
};
