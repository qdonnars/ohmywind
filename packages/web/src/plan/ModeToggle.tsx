// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

export type PlanMode = "single" | "compare";

// Sub-mode inside "Simuler ma route": is the picked time a departure or a
// target arrival? Departure → forward simulation. Arrival → ETA-driven solve
// (server.estimate_passage_for_arrival via /api/v1/passage-by-eta).
export type TimeAnchor = "departure" | "arrival";

// Per-mode accent, picked up by tab icons so the two modes feel distinct at
// a glance (teal = simulate, amber = compare windows).
const MODE_ACCENT: Record<PlanMode, string> = {
  single: "var(--ow-accent)",
  compare: "var(--ow-compare)",
};

const MODE_META: Record<PlanMode, { title: string; sub: string; icon: "route" | "clock" }> = {
  single: { title: "Simuler ma route", sub: "Combien de temps pour ce trajet ?", icon: "route" },
  compare: { title: "Comparer les fenêtres", sub: "Le meilleur créneau pour partir ?", icon: "clock" },
};

function ModeIcon({ name, size = 12, color }: { name: "route" | "clock"; size?: number; color: string }) {
  if (name === "clock") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
    );
  }
  // route: a wavy path with two waypoint dots
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12c2-4 5-1 7-3 1-1 2-3 3-3" />
      <circle cx="3" cy="12" r="1.5" fill={color} stroke="none" />
      <circle cx="13" cy="6" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

export function ModeToggle({
  value,
  onChange,
  locked = false,
  pristine = false,
}: {
  value: PlanMode;
  onChange: (m: PlanMode) => void;
  /** When true, shows both tabs dimmed and inactive (used for the empty state). */
  locked?: boolean;
  /** When true (typical first arrival with 2+ waypoints but no mode chosen
   *  yet), render BOTH tabs as un-selected with a soft pulsing accent outline
   *  on the container — so the user reads it as "pick one" rather than "one
   *  is already active". Overridden by `locked`. */
  pristine?: boolean;
}) {
  // Pristine mode lifts each pill into its own button-shaped surface (own
  // border, own shadow, larger gap) so the control reads as "two choices to
  // pick from" rather than "one box with an internal divider". Both pills
  // pulse in sync to invite a tap.
  const pristineActive = !locked && pristine;
  const gridGap = pristineActive ? "gap-2" : "gap-0.5";
  const padding = pristineActive ? "p-0" : "p-[3px]";
  return (
    <div
      className={`grid grid-cols-2 ${gridGap} ${padding} rounded-lg`}
      style={{
        background: pristineActive ? "transparent" : "var(--ow-bg-2)",
        border: `1px solid ${pristineActive ? "transparent" : "var(--ow-line)"}`,
      }}
      role="tablist"
      aria-label="Mode de planification"
    >
      {(["single", "compare"] as const).map((m) => {
        const meta = MODE_META[m];
        const active = !locked && !pristine && value === m;
        const dim = locked;
        const showAccentIcon = active || pristineActive;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !locked && onChange(m)}
            disabled={locked}
            className={`text-left transition-all ${pristineActive ? "mode-toggle-pristine-pill" : ""}`}
            style={{
              padding: pristineActive ? "10px 12px" : "8px 10px",
              background: pristineActive
                ? "var(--ow-bg-1)"
                : active
                  ? "var(--ow-bg-1)"
                  : "transparent",
              border: pristineActive
                ? "1px solid var(--ow-accent-line)"
                : active
                  ? "1px solid var(--ow-line-2)"
                  : "1px solid transparent",
              borderRadius: pristineActive ? 8 : 6,
              boxShadow: pristineActive || active ? "var(--ow-shadow-sm)" : "none",
              opacity: dim ? 0.4 : 1,
              cursor: locked ? "default" : "pointer",
            }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <ModeIcon name={meta.icon} size={11} color={showAccentIcon ? MODE_ACCENT[m] : "var(--ow-fg-2)"} />
              <span
                className="text-xs font-semibold"
                style={{ color: active || pristineActive ? "var(--ow-fg-0)" : "var(--ow-fg-1)" }}
              >
                {meta.title}
              </span>
            </div>
            <div className="text-[10px] leading-tight" style={{ color: "var(--ow-fg-2)" }}>
              {meta.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const TIME_ANCHOR_META: Record<TimeAnchor, { title: string; sub: string }> = {
  departure: { title: "Définir le départ", sub: "Comprendre le temps de trajet" },
  arrival: { title: "Définir l'arrivée", sub: "Quand partir au plus tard ?" },
};

export function TimeAnchorToggle({
  value,
  onChange,
}: {
  value: TimeAnchor;
  onChange: (a: TimeAnchor) => void;
}) {
  // Secondary tabs nested under the chosen mode: light accent-soft pill on
  // the active option, no border / no shadow / no enclosing surface — so the
  // visual weight stays clearly below ModeToggle's bordered pills. Reads as
  // "sub-option within the picked mode" rather than a parallel choice.
  return (
    <div
      className="grid grid-cols-2 gap-0.5"
      role="tablist"
      aria-label="Ancrage horaire"
    >
      {(["departure", "arrival"] as const).map((m) => {
        const meta = TIME_ANCHOR_META[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="text-left transition-colors"
            style={{
              padding: "8px 10px",
              background: active ? "var(--ow-accent-soft)" : "transparent",
              borderRadius: 6,
            }}
          >
            <div
              className="text-xs font-semibold mb-0.5"
              style={{ color: active ? "var(--ow-fg-0)" : "var(--ow-fg-1)" }}
            >
              {meta.title}
            </div>
            <div className="text-[10px] leading-tight" style={{ color: "var(--ow-fg-2)" }}>
              {meta.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
