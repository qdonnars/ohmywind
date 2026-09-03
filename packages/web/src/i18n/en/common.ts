// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { common as frCommon } from "../fr/common";

export const common: Record<keyof typeof frCommon, string> = {
  "common.loading": "Loading…",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.retry": "Retry",
  "common.days.one": "{count} day",
  "common.days.other": "{count} days",
};
