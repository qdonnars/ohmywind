// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { TimezoneMode } from "../hooks/useTimezone";
import { parisOffsetMinAt } from "../domain/datetime";

const DAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// The API is fetched with timezone=Europe/Paris, so timestamps like
// "2026-04-26T14:00" represent 14:00 Paris time (no suffix).
// Boat mode: read hours directly from the string (= Paris time as-is).
// UTC mode: append the Paris UTC offset so Date can convert to UTC.
// Local mode: interpret as-is via Date (current browser local time).
//
// The offset itself is `domain/datetime.ts`'s business: this module used to
// carry a second implementation of it, with its own memo and its own
// daylight-saving edge case.

/**
 * Format the hour for a timeline cell.
 * The iso string is in Paris time (no timezone suffix).
 */
export function formatHour(iso: string, mode: TimezoneMode = "local"): string {
  if (mode === "boat") {
    // Read directly from the string — it's already Paris time
    return String(parseInt(iso.slice(11, 13), 10));
  }
  if (mode === "utc") {
    // The string represents Paris time. To get UTC, subtract the Paris offset.
    const offsetMin = parisOffsetMinAt(iso);
    const parisHour = parseInt(iso.slice(11, 13), 10);
    const parisMin = parseInt(iso.slice(14, 16), 10);
    const totalUTCMin = (parisHour * 60 + parisMin - offsetMin + 1440) % 1440;
    return String(Math.floor(totalUTCMin / 60));
  }
  // local: iso is Paris time without offset — convert Paris→UTC→browser-local
  const offsetMin = parisOffsetMinAt(iso);
  const realUtcMs = new Date(iso + "Z").getTime() - offsetMin * 60000;
  return String(new Date(realUtcMs).getHours());
}

/**
 * Format the day header for a timeline column group.
 * Uses boat mode (Paris time from the string) when requested,
 * falls back to local otherwise.
 */
export function formatDayHeader(iso: string, mode: TimezoneMode = "local"): string {
  if (mode === "boat" || mode === "utc") {
    // Derive day directly from the ISO date part (Paris time)
    const [datePart] = iso.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return `${DAYS_EN[d.getUTCDay()]} ${day}`;
  }
  const offsetMin = parisOffsetMinAt(iso);
  const realUtcMs = new Date(iso + "Z").getTime() - offsetMin * 60000;
  const d = new Date(realUtcMs);
  return `${DAYS_EN[d.getDay()]} ${d.getDate()}`;
}

export function groupHoursByDay(times: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  times.forEach((t, i) => {
    const key = t.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(i);
  });
  return map;
}
