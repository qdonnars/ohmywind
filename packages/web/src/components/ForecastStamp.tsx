// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import { useT } from "../i18n";
import {
  FORECAST_STALE_WARNING_HOURS,
  formatForecastWhen,
  isForecastStale,
} from "../offline/freshness";

/**
 * The warning a forecast past `FORECAST_STALE_WARNING_HOURS` carries, on the
 * warning tokens (both themes). Nothing below the threshold.
 *
 * "Now" is read once, when the note mounts: a forecast does not cross the
 * threshold while someone reads it, and a fresh fetch remounts the panel.
 */
export function ForecastStaleNote({ fetchedAt, className = "" }: { fetchedAt: number | string; className?: string }) {
  const { t } = useT();
  const [now] = useState(() => Date.now());
  const at = typeof fetchedAt === "number" ? fetchedAt : new Date(fetchedAt).getTime();
  if (!Number.isFinite(at) || !isForecastStale(at, now)) return null;
  return (
    <p
      role="note"
      className={`px-2 py-1 rounded-md text-[11px] font-medium ${className}`}
      style={{
        background: "var(--ow-warn-soft)",
        border: "1px solid var(--ow-warn-line)",
        color: "var(--ow-warn-ink)",
      }}
    >
      {t("common.forecast.stale", { hours: FORECAST_STALE_WARNING_HOURS })}
    </p>
  );
}

/**
 * « Prévisions du mar. 17 nov. à 09:00 », on a forecast read from the device
 * rather than just fetched, plus the warning when it has aged. One line on
 * the explorer's panel, over the tables it dates.
 */
export function ForecastStamp({ fetchedAt }: { fetchedAt: number }) {
  const { t } = useT();
  return (
    <div className="shrink-0 flex flex-col gap-1 px-2 pb-1">
      <p
        className="self-start px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums"
        style={{ background: "var(--ow-surface-pop)", color: "var(--ow-fg-1)", border: "1px solid var(--ow-line)" }}
      >
        {t("common.forecast.from", { when: formatForecastWhen(fetchedAt) })}
      </p>
      <ForecastStaleNote fetchedAt={fetchedAt} />
    </div>
  );
}
