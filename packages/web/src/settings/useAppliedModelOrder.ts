// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useSyncExternalStore } from "react";
import { loadModelConfig, subscribeModelConfig } from "../config/modelConfig";
import { isSettingsOpen, subscribeSettings } from "./settingsStore";

/**
 * The stored model order, as a string fit for an effect's dependencies, and
 * only once the settings are closed.
 *
 * The forecast under the settings must show the order the reader chose, so
 * the pages that fetch it re-run on a change. But a reorder is a few drags in
 * a row, and each would cost a round of requests against the forecast quota:
 * while the settings stay open the value is held, and it moves once, when
 * they close. The full order rather than the four shown, because the models
 * below the cut are the fallbacks of the fetch (`api/openmeteo.ts`).
 */
let applied: string | null = null;

function read(): string {
  if (applied === null || !isSettingsOpen()) applied = loadModelConfig().order.join(",");
  return applied;
}

function subscribe(listener: () => void): () => void {
  const offModels = subscribeModelConfig(listener);
  const offSettings = subscribeSettings(listener);
  return () => {
    offModels();
    offSettings();
  };
}

export function useAppliedModelOrder(): string {
  return useSyncExternalStore(subscribe, read, read);
}
