// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useState } from "react";
import { fetchMarineCorridor } from "../api/marine";
import { fetchWindCorridor } from "../api/openmeteo";
import { activeModels, loadModelConfig } from "../config/modelConfig";
import type { Spot } from "../types";
import { mergeModelChain, rowKey, type CompareRow } from "./data";

interface Loaded {
  /** The set of spots these rows were fetched for. */
  key: string;
  rows: CompareRow[];
}

/** The design has twelve days follow each other in the scroll, so that is
    what the wind is asked for. The high-resolution models answer nulls past
    their own horizon and `mergeModelChain` fills from the ones behind them.
    The sea stays on its own week: the band simply ends there. */
const COMPARE_DAYS = 12;

function setKey(spots: Spot[]): string {
  return spots.map(rowKey).join("|");
}

/**
 * Forecasts for every favourite at once.
 *
 * Through the corridor endpoints the planner uses rather than spot by spot:
 * Open-Meteo takes a list of coordinates, so five spots cost one request
 * per model plus one for the sea, the same as a single spot on the explore
 * page. The answers land in the same 30-minute caches, so a spot just
 * looked at is free here, and a spot compared here is free on the map.
 *
 * Each spot reads the reader's active models as one chain, in the order they
 * chose in the settings: AROME by default, then whatever comes next for the
 * hours it does not cover. The row keeps a single series, and the page never
 * names a model.
 */
export function useCompareData(spots: Spot[]): { rows: CompareRow[]; isLoading: boolean } {
  const key = setKey(spots);
  const [loaded, setLoaded] = useState<Loaded>({ key: "", rows: [] });

  useEffect(() => {
    if (spots.length === 0) return;
    let cancelled = false;
    const coords = spots.map((s) => ({ lat: s.latitude, lon: s.longitude }));
    const models = activeModels(loadModelConfig());
    Promise.all([fetchWindCorridor(coords, models, COMPARE_DAYS), fetchMarineCorridor(coords)]).then(
      ([wind, marine]) => {
        if (cancelled) return;
        setLoaded({
          key: setKey(spots),
          rows: spots.map((spot, i) => ({
            spot,
            forecast: mergeModelChain(wind[i] ?? []),
            marine: marine[i] ?? null,
          })),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [spots]);

  // Derived rather than stored: the skeleton is part of the very commit that
  // changes the set, and rows fetched for another set are never shown.
  const current = loaded.key === key;
  return {
    rows: current ? loaded.rows : [],
    isLoading: spots.length > 0 && !current,
  };
}
