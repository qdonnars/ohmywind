// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { config as frConfig } from "../fr/config";

export const config: Record<keyof typeof frConfig, string> = {
  "config.lang.label": "Language",
  "config.lang.backendNote":
    "Warnings computed by the passage engine remain in French for now.",
};
