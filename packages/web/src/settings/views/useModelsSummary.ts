// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";
import {
  MODEL_META,
  activeModels,
  loadModelConfig,
  subscribeModelConfig,
  type ModelName,
} from "../../config/modelConfig";
import { useT } from "../../i18n";

// A string, so the snapshot compares equal for as long as nothing wrote.
const readActive = () => activeModels(loadModelConfig()).join(",");

/** The subtitle of « Modèles météo › » on the root view: the models the
    table shows, in their order. Belongs to the Models view's lot. */
export function useModelsSummary(): string {
  const { t } = useT();
  const active = useSyncExternalStore(subscribeModelConfig, readActive, readActive);
  const labels = active.split(",").map((m) => MODEL_META[m as ModelName].label);
  return t("settings.models.summary", { models: labels.join(", ") });
}
