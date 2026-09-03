// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { ReactNode } from "react";
import type { MetricView } from "../types";
import { useT, type Key } from "../i18n";

interface PillsProps {
  view: MetricView;
  onSelect: (view: MetricView) => void;
  showWaves: boolean;
  showTides: boolean;
  showCurrents: boolean;
}

interface PillDef {
  view: MetricView;
  label: Key;
  visible: boolean;
  icon: ReactNode;
}

// Wind: stacked airflow lines (mirrors the brand mark in Header).
const WindIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);

// Waves: two stacked sinusoids.
const WavesIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
    <path d="M2 13c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
    <path d="M2 20c1.5 0 2.5-1 4-1s2.5 1 4 1 2.5-1 4-1 2.5 1 4 1 2.5-1 4-1" />
  </svg>
);

// Tides: crescent moon (lunar driver).
const TidesIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// Currents: directional arrow with curved trail (flow).
const CurrentsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12c2-4 6-4 8 0s6 4 8 0" />
    <path d="M16 8l3 4-3 4" />
  </svg>
);

export function MetricPills({
  view,
  onSelect,
  showWaves,
  showTides,
  showCurrents,
}: PillsProps) {
  const { t } = useT();
  const pills: PillDef[] = [
    { view: "wind", label: "explore.pills.wind", visible: true, icon: WindIcon },
    { view: "waves", label: "explore.pills.waves", visible: showWaves, icon: WavesIcon },
    { view: "tides", label: "explore.pills.tides", visible: showTides, icon: TidesIcon },
    {
      view: "currents",
      label: "explore.pills.currents",
      visible: showCurrents,
      icon: CurrentsIcon,
    },
  ];
  const visible = pills.filter((p) => p.visible);
  if (visible.length <= 1) return null;
  return (
    <div
      className="flex gap-2 px-3 py-2.5 overflow-x-auto"
      role="tablist"
      aria-label={t("explore.pills.groupLabel")}
    >
      {visible.map((p) => {
        const active = p.view === view;
        return (
          <button
            key={p.view}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.view)}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            style={{
              color: active ? "var(--ow-accent)" : "var(--ow-fg-1)",
              background: active ? "var(--ow-accent-soft)" : "transparent",
              border: `1px solid ${active ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
            }}
          >
            <span aria-hidden className="shrink-0">{p.icon}</span>
            <span>{t(p.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
