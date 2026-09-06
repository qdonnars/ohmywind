// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Wird geladen…",
  "common.close": "Schließen",
  "common.cancel": "Abbrechen",
  "common.back": "Zurück",
  "common.retry": "Erneut versuchen",
  "common.days.one": "{count} Tag",
  "common.days.other": "{count} Tage",
};
