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
};
