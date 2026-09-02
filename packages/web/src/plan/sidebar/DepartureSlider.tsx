// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useMemo, useState } from "react";
import { toNaiveLocal } from "../session/initial";
import { useTheme } from "../../design/useTheme";
import { usePlan } from "../session/planContext";

// ── DepartureSlider ──────────────────────────────────────────────────────────

// Open-Meteo's forecast endpoint caps start_date/end_date at ~today+15. We cap
// the slider at 14 d to leave 1 d of margin (clock skew, TZ crossings).
const SLIDER_MAX_HOURS = 14 * 24;

export function DepartureSlider() {
  const { state, actions } = usePlan();
  const value = state.departure;
  const onChange = actions.setDeparture;
  const timeAnchor = state.timeAnchor;
  const { resolvedTheme } = useTheme();
  const [showManual, setShowManual] = useState(false);

  // Anchor "now" once per mount so the slider's left edge stays fixed during interaction.
  const anchor = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  }, []);

  const valueDate = useMemo(() => new Date(value), [value]);
  const valueHours = Math.max(
    0,
    Math.min(SLIDER_MAX_HOURS, Math.round((valueDate.getTime() - anchor.getTime()) / 3_600_000)),
  );

  function setHours(h: number) {
    const d = new Date(anchor.getTime() + h * 3_600_000);
    onChange(toNaiveLocal(d));
  }

  function resetToNow() {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    onChange(toNaiveLocal(d));
  }

  // Display labels — section header changes with the time anchor.
  const sectionLabel = timeAnchor === "arrival" ? "Arrivée" : "Départ";
  const ariaLabel = timeAnchor === "arrival" ? "Heure d'arrivée souhaitée" : "Date de départ";
  const dateLabel = valueDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = valueDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dayDelta = Math.floor((valueDate.getTime() - anchor.getTime()) / 86_400_000);
  const offsetLabel =
    dayDelta <= 0 ? "Aujourd'hui" :
    dayDelta === 1 ? "Demain" :
    `Dans ${dayDelta} jours`;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--ow-fg-2)" }}>
          {sectionLabel}
        </span>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-[10px] underline"
          style={{ color: "var(--ow-fg-2)" }}
        >
          {showManual ? "Slider" : "Ajuster"}
        </button>
      </div>

      <div className="text-sm font-semibold mb-2" style={{ color: "var(--ow-fg-0)" }}>
        <span className="capitalize">{dateLabel}</span>
        <span className="mx-1.5" style={{ color: "var(--ow-fg-2)" }}>·</span>
        <span className="tabular-nums" style={{ fontFamily: "var(--ow-font-mono)" }}>{timeLabel}</span>
        <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--ow-fg-2)" }}>{offsetLabel}</span>
      </div>

      {showManual ? (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ow-datetime-input w-full rounded-lg px-3 py-2 text-sm font-semibold tabular-nums"
          style={{
            background: "var(--ow-bg-2)",
            color: "var(--ow-fg-0)",
            border: "1px solid var(--ow-line)",
            fontFamily: "var(--ow-font-mono)",
            colorScheme: resolvedTheme === "light" ? "light" : "dark",
          }}
        />
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={SLIDER_MAX_HOURS}
            step={1}
            value={valueHours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="ow-departure-slider w-full"
            aria-label={ariaLabel}
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--ow-fg-2)" }}>
            {/* Maintenant is clickable: defaulting to J+1 lets the user pick a
                horizon, but a single tap still lands them back at "now". */}
            <button
              type="button"
              onClick={resetToNow}
              className="underline-offset-2 hover:underline"
              style={{ color: dayDelta <= 0 ? "var(--ow-accent)" : "var(--ow-fg-2)" }}
            >
              Maintenant
            </button>
            <span>+1 sem.</span>
            <span>+2 sem.</span>
          </div>
        </>
      )}
    </div>
  );
}



// ModeToggle moved to ./ModeToggle so CompactDrawer can reuse it.
