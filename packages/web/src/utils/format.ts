// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { TimezoneMode } from "../hooks/useTimezone";

const DAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// The API is fetched with timezone=Europe/Paris, so timestamps like
// "2026-04-26T14:00" represent 14:00 Paris time (no suffix).
// Boat mode: read hours directly from the string (= Paris time as-is).
// UTC mode: append the Paris UTC offset so Date can convert to UTC.
// Local mode: interpret as-is via Date (current browser local time).

/** UTC offset in minutes for Europe/Paris at the given ISO date-time string */
function parisTzOffsetMin(iso: string): number {
  // Append a fake UTC marker to get a Date object, then compute the offset
  // by comparing Paris wall-clock to UTC wall-clock.
  const utcMs = new Date(iso + "Z").getTime();
  // Format the UTC timestamp in Europe/Paris to read the displayed hour/minute
  const parisFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = parisFormatter.formatToParts(new Date(utcMs));
  const parisHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const parisMin = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const utcHour = new Date(utcMs).getUTCHours();
  const utcMin = new Date(utcMs).getUTCMinutes();
  return (parisHour * 60 + parisMin) - (utcHour * 60 + utcMin);
}

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
    const offsetMin = parisTzOffsetMin(iso);
    const parisHour = parseInt(iso.slice(11, 13), 10);
    const parisMin = parseInt(iso.slice(14, 16), 10);
    const totalUTCMin = (parisHour * 60 + parisMin - offsetMin + 1440) % 1440;
    return String(Math.floor(totalUTCMin / 60));
  }
  // local: iso is Paris time without offset — convert Paris→UTC→browser-local
  const offsetMin = parisTzOffsetMin(iso);
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
  const offsetMin = parisTzOffsetMin(iso);
  const realUtcMs = new Date(iso + "Z").getTime() - offsetMin * 60000;
  const d = new Date(realUtcMs);
  return `${DAYS_EN[d.getDay()]} ${d.getDate()}`;
}

/** Return "YYYY-MM-DDTHH" for the current moment in Europe/Paris time.
 * The heatmap timeline is keyed in Paris time, so nowHour must match. */
export function nowParisHourPrefix(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const h = get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${h === "24" ? "00" : h}`;
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
