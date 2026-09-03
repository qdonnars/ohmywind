// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { Dict } from "../fr";
import { common } from "./common";
import { config } from "./config";
import { explore } from "./explore";
import { plan } from "./plan";
import { panel } from "./panel";

export const en: Dict = { ...common, ...config, ...explore, ...plan, ...panel };
