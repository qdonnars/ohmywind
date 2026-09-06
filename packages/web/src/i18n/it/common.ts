// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Caricamento…",
  "common.close": "Chiudere",
  "common.cancel": "Annullare",
  "common.back": "Indietro",
  "common.retry": "Riprovare",
  "common.days.one": "{count} giorno",
  "common.days.other": "{count} giorni",
};
