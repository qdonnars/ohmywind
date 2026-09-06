// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { compare as frCompare } from "../fr/compare";

export const compare: Record<keyof typeof frCompare, string> = {
  "compare.empty.title": "Nessuno spot da confrontare",
  "compare.empty.body":
    "Salvate i vostri spot da Esplorare, con una pressione prolungata sulla mappa o un clic destro: appariranno qui fianco a fianco.",
  "compare.empty.cta": "Esplorare la mappa",

  "compare.table.empty": "Nessun dato disponibile per i vostri spot.",
  "compare.table.offline":
    "Offline: impossibile recuperare le previsioni. Riconnettetevi e riaprite questa pagina.",
  "compare.row.focus": "Centrare la mappa su {name}",
  "compare.row.open": "Aprire {name} in Esplorare",
  "compare.row.noData": "Fuori copertura",
};
