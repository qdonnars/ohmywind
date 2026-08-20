// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useState } from "react";
import type { PassageWindow } from "./types";
import { CX_COLORS } from "./types";
import { fmtDurationSafe } from "./format";

type SortKey = "departure" | "duration" | "complexity";

const SAIL_LABELS: Record<string, string> = {
  pres: "Près",
  travers: "Travers",
  largue: "Largue",
  portant: "Portant",
};

function fmtDeparture(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const hh = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${hh}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
  return fmtTime(iso);
}

export interface WindowsTableProps {
  windows: PassageWindow[];
  onSelect?: (w: PassageWindow) => void;
}

export function WindowsTable({ windows, onSelect }: WindowsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("departure");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  function SortHeader({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" | "center" }) {
    const active = sortKey === k;
    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
    return (
      <button
        onClick={() => toggleSort(k)}
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
        <SortHeader k="departure" label="Départ" />
        <SortHeader k="duration" label="Durée" />
        <span className="text-left">ETA</span>
        <span className="text-left">Allure</span>
        <span className="text-left">Vent (kn)</span>
        <span className="text-left">Mer</span>
        <SortHeader k="complexity" label="⚡" align="center" />
      </div>

      <div>
        {sorted.map((w, idx) => {
          // Defensive reads — backend version skew (e.g. older HF Space) may
          // omit nested fields that newer types declare. Default to empty
          // shapes so display falls back to "—" instead of crashing.
          const cs = w.conditions_summary ?? {} as Partial<typeof w.conditions_summary>;
          const cx = w.complexity ?? {} as Partial<typeof w.complexity>;
          const sail = cs.predominant_sail_angle;
          const cxLvl = typeof cx.level === "number" ? cx.level : 0;
          const cxColor = CX_COLORS[cxLvl] ?? "var(--ow-fg-3)";
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
              title="Voir le détail de cette fenêtre"
            >
              <span className="tabular-nums" style={{ color: "var(--ow-fg-0)" }}>
                {fmtDeparture(w.departure)}
              </span>
              <span className="tabular-nums">{fmtDurationSafe(w.duration_h)}</span>
              <span className="tabular-nums">{fmtTimeSafe(w.arrival)}</span>
              <span className="capitalize" style={{ color: "var(--ow-fg-1)" }}>
                {sail ? (SAIL_LABELS[sail] ?? sail) : "—"}
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
                  title={cx.label && cx.rationale ? `${cx.label} : ${cx.rationale}` : cx.label ?? ""}
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
