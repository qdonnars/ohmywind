// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo } from "react";
import { fmtClock, fmtDay } from "../../domain/datetime";
import { useT } from "../../i18n";

// ── DepartureRangeSlider ─────────────────────────────────────────────────────
// Dual-thumb slider for the compare-windows form. Two overlapping native ranges
// keyed in hours-from-now; the right thumb is constrained to stay >= 1 h after
// the left thumb. Constraints by construction = no out-of-range dates can be
// picked, replacing the error-prone datetime-local pair.

const RANGE_MAX_HOURS = 14 * 24; // mirror Open-Meteo cap (today+14d)

export function DepartureRangeSlider({
  earliestHours,
  latestHours,
  onChange,
}: {
  earliestHours: number;
  latestHours: number;
  onChange: (earliest: number, latest: number) => void;
}) {
  const { t } = useT();
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);

  const eClamped = Math.max(0, Math.min(RANGE_MAX_HOURS - 1, earliestHours));
  const lClamped = Math.max(eClamped + 1, Math.min(RANGE_MAX_HOURS, latestHours));

  function setEarliest(h: number) {
    const next = Math.max(0, Math.min(RANGE_MAX_HOURS - 1, h));
    const newLatest = Math.max(next + 1, lClamped);
    onChange(next, Math.min(RANGE_MAX_HOURS, newLatest));
  }
  function setLatest(h: number) {
    const next = Math.min(RANGE_MAX_HOURS, Math.max(eClamped + 1, h));
    onChange(eClamped, next);
  }

  function fmt(hours: number): { date: string; time: string; offset: string } {
    const d = new Date(anchor.getTime() + hours * 3_600_000);
    return {
      date: fmtDay(d),
      time: fmtClock(d),
      offset: (() => {
        const days = Math.floor(hours / 24);
        if (days === 0) return t("panel.departure.today");
        if (days === 1) return t("panel.departure.tomorrow");
        return t("panel.departure.dayPlus", { count: days });
      })(),
    };
  }

  const eFmt = fmt(eClamped);
  const lFmt = fmt(lClamped);
  const windowHours = lClamped - eClamped;
  const windowLabel = windowHours >= 24
    ? t("panel.range.spanDays", {
        value: (windowHours / 24).toFixed(windowHours % 24 === 0 ? 0 : 1),
      })
    : t("panel.range.spanHours", { value: windowHours });

  // Track fill % for visual fill between thumbs
  const fillStart = (eClamped / RANGE_MAX_HOURS) * 100;
  const fillEnd = (lClamped / RANGE_MAX_HOURS) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--ow-fg-2)" }}>
          {t("panel.range.title")}
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: "var(--ow-accent)" }}>
          {windowLabel}
        </span>
      </div>

      {/* Two readouts, one per thumb */}
      <div className="flex items-baseline justify-between text-xs mb-2 tabular-nums" style={{ fontFamily: "var(--ow-font-mono)" }}>
        <div>
          <div className="capitalize font-semibold" style={{ color: "var(--ow-fg-0)" }}>
            {eFmt.date} · {eFmt.time}
          </div>
          <div className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>{eFmt.offset}</div>
        </div>
        <div className="text-right">
          <div className="capitalize font-semibold" style={{ color: "var(--ow-fg-0)" }}>
            {lFmt.date} · {lFmt.time}
          </div>
          <div className="text-[10px]" style={{ color: "var(--ow-fg-2)" }}>{lFmt.offset}</div>
        </div>
      </div>

      <div className="ow-range-track">
        <div className="ow-range-track-bg" />
        <div
          className="ow-range-track-fill"
          style={{ left: `${fillStart}%`, right: `${100 - fillEnd}%` }}
        />
        <input
          type="range"
          min={0}
          max={RANGE_MAX_HOURS}
          step={1}
          value={eClamped}
          onChange={(e) => setEarliest(Number(e.target.value))}
          className="ow-range-input"
          aria-label={t("panel.range.ariaEarliest")}
          style={{ zIndex: eClamped > RANGE_MAX_HOURS / 2 ? 3 : 2 }}
        />
        <input
          type="range"
          min={0}
          max={RANGE_MAX_HOURS}
          step={1}
          value={lClamped}
          onChange={(e) => setLatest(Number(e.target.value))}
          className="ow-range-input"
          aria-label={t("panel.range.ariaLatest")}
          style={{ zIndex: eClamped > RANGE_MAX_HOURS / 2 ? 2 : 3 }}
        />
      </div>

      <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--ow-fg-2)" }}>
        <span>{t("panel.departure.now")}</span>
        <span>{t("panel.departure.plusOneWeek")}</span>
        <span>{t("panel.departure.plusTwoWeeks")}</span>
      </div>
    </div>
  );
}
