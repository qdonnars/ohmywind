// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useState } from "react";
import type { PassageWindow } from "./types";
import { cxLevelVar } from "../domain/thresholds";
import { fmtDurationSafe } from "./format";
import { fmtClock, fmtDay } from "../domain/datetime";
import { useT, type Key } from "../i18n";

type SortKey = "departure" | "duration" | "complexity";
type SortDir = "asc" | "desc";

// The server's own sail-angle buckets, keyed by the value it sends. A bucket
// we do not know about is shown as the server spelt it.
const SAIL_KEYS: Record<string, Key> = {
  pres: "panel.windows.sailUpwind",
  travers: "panel.windows.sailBeamReach",
  largue: "panel.windows.sailBroadReach",
  portant: "panel.windows.sailDownwind",
};

function fmtDeparture(iso: string): string {
  const d = new Date(iso);
  return `${fmtDay(d)} · ${fmtClock(d)}`;
}

function fmtRange(min: number | null | undefined, max: number | null | undefined, unit: string, decimals = 0): string {
  // Defensive: a HF Space deployment lag may serve a response missing fields
  // we expect (e.g. hs_min_m before #69). Prefer a graceful "—" over a render
  // crash. Use loose `== null` to catch both null and undefined.
  if (min == null && max == null) return "—";
  if (min == null) return `${max!.toFixed(decimals)} ${unit}`;
  if (max == null) return `${min.toFixed(decimals)} ${unit}`;
  const a = min.toFixed(decimals);
  const b = max.toFixed(decimals);
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`;
}

function fmtHsRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return "—";
  return fmtRange(min, max, "m", 1);
}

function fmtTimeSafe(iso: string | null | undefined): string {
  if (!iso) return "—";
  return fmtClock(iso);
}

export interface WindowsTableProps {
  windows: PassageWindow[];
  onSelect?: (w: PassageWindow) => void;
}

export function WindowsTable({ windows, onSelect }: WindowsTableProps) {
  const { t } = useT();
  const [sortKey, setSortKey] = useState<SortKey>("departure");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const list = [...windows];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "departure") {
        cmp = new Date(a.departure).getTime() - new Date(b.departure).getTime();
      } else if (sortKey === "duration") {
        cmp = (a.duration_h ?? 0) - (b.duration_h ?? 0);
      } else if (sortKey === "complexity") {
        cmp = (a.complexity?.level ?? 0) - (b.complexity?.level ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [windows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "complexity" ? "asc" : "asc");
    }
  }

  return (
    <div>
      <div
        className="grid items-center gap-2 px-2 py-1.5 text-[9px] uppercase tracking-widest border-b"
        style={{
          gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.9fr 0.9fr 0.55fr",
          borderColor: "var(--ow-line)",
          color: "var(--ow-fg-3)",
        }}
      >
        <SortHeader k="departure" label={t("panel.windows.colDeparture")} sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
        <SortHeader k="duration" label={t("panel.windows.colDuration")} sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
        <span className="text-left">{t("panel.windows.colEta")}</span>
        <span className="text-left">{t("panel.windows.colPointOfSail")}</span>
        <span className="text-left">{t("panel.windows.colWind")}</span>
        <span className="text-left">{t("panel.windows.colSea")}</span>
        <SortHeader k="complexity" label="⚡" align="center" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
      </div>

      <div>
        {sorted.map((w, idx) => {
          // Defensive reads — backend version skew (e.g. older HF Space) may
          // omit nested fields that newer types declare. Default to empty
          // shapes so display falls back to "—" instead of crashing.
          const cs = w.conditions_summary ?? {} as Partial<typeof w.conditions_summary>;
          const cx = w.complexity ?? {} as Partial<typeof w.complexity>;
          const sail = cs.predominant_sail_angle;
          const sailText = sail ? (SAIL_KEYS[sail] ? t(SAIL_KEYS[sail]) : sail) : "—";
          const cxLvl = typeof cx.level === "number" ? cx.level : 0;
          // A window with no complexity block reads level 0, outside the palette.
          const cxColor = cxLvl >= 1 && cxLvl <= 5 ? cxLevelVar(cxLvl) : "var(--ow-fg-3)";
          return (
            <button
              key={w.departure}
              onClick={() => onSelect?.(w)}
              className="w-full text-left grid items-center gap-2 px-2 py-2 text-xs transition-colors hover:bg-[var(--ow-bg-2)]"
              style={{
                gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.9fr 0.9fr 0.55fr",
                fontFamily: "var(--ow-font-mono)",
                color: "var(--ow-fg-1)",
                borderTop: idx === 0 ? "none" : "1px solid var(--ow-line)",
              }}
              title={t("panel.windows.rowTitle")}
            >
              <span className="tabular-nums" style={{ color: "var(--ow-fg-0)" }}>
                {fmtDeparture(w.departure)}
              </span>
              <span className="tabular-nums">{fmtDurationSafe(w.duration_h)}</span>
              <span className="tabular-nums">{fmtTimeSafe(w.arrival)}</span>
              <span className="capitalize" style={{ color: "var(--ow-fg-1)" }}>
                {sailText}
              </span>
              <span className="tabular-nums">{fmtRange(cs.tws_min_kn, cs.tws_max_kn, "")}</span>
              <span className="tabular-nums">{fmtHsRange(cs.hs_min_m, cs.hs_max_m)}</span>
              <span className="flex justify-center">
                <span
                  className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[11px] font-bold"
                  style={{
                    background: cxColor + "22",
                    color: cxColor,
                    border: `1px solid ${cxColor}55`,
                  }}
                  title={
                    cx.label && cx.rationale
                      ? t("panel.windows.complexityTitle", { label: cx.label, rationale: cx.rationale })
                      : cx.label ?? ""
                  }
                >
                  {cxLvl || "—"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Declared at module scope, not inside WindowsTable: a component created during
// render is a new type on every render, so React unmounts the old one and
// remounts a fresh instance, losing its state and its DOM node. Harmless for a
// stateless header today, a real bug the day one of them holds a popover.
function SortHeader({
  k,
  label,
  align = "left",
  sortKey,
  sortDir,
  onToggle,
}: {
  k: SortKey;
  label: string;
  align?: "left" | "right" | "center";
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
  return (
    <button
      onClick={() => onToggle(k)}
      className="flex items-center gap-1 transition-colors w-full"
      style={{
        color: active ? "var(--ow-fg-0)" : "var(--ow-fg-3)",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        fontWeight: 600,
      }}
    >
      {label} <span className="text-[8px] opacity-60">{arrow || "↕"}</span>
    </button>
  );
}
