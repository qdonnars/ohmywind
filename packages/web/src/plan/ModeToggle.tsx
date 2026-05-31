export type PlanMode = "single" | "compare";

// Sub-mode inside "Simuler ma route": is the picked time a departure or a
// target arrival? Departure → forward simulation. Arrival → ETA-driven solve
// (server.estimate_passage_for_arrival via /api/v1/passage-by-eta).
export type TimeAnchor = "departure" | "arrival";

// Per-mode accent palette — picked up by tab icons so the two modes feel
// distinct at a glance (cyan = simulate, amber = compare windows).
const MODE_ACCENT: Record<PlanMode, string> = {
  single: "var(--ow-accent)",
  compare: "#F4C25C",
};

const MODE_META: Record<PlanMode, { title: string; sub: string; icon: "route" | "clock" }> = {
  single: { title: "Simuler ma route", sub: "Combien de temps pour ce trajet ?", icon: "route" },
  compare: { title: "Comparer les fenêtres", sub: "Quand partir ?", icon: "clock" },
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
  // In pristine mode, never highlight a pill as active — both should feel
  // equally up-for-grabs. The icon colour stays at the mode's accent so the
  // pill still reads as a meaningful choice, not a disabled control.
  return (
    <div
      className={`grid grid-cols-2 gap-0.5 p-[3px] rounded-lg ${!locked && pristine ? "mode-toggle-pristine" : ""}`}
      style={{
        background: "var(--ow-bg-2)",
        border: `1px solid ${!locked && pristine ? "var(--ow-accent-line)" : "var(--ow-line)"}`,
      }}
      role="tablist"
      aria-label="Mode de planification"
    >
      {(["single", "compare"] as const).map((m) => {
        const meta = MODE_META[m];
        const active = !locked && !pristine && value === m;
        const dim = locked;
        const showAccentIcon = active || (!locked && pristine);
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !locked && onChange(m)}
            disabled={locked}
            className="text-left transition-all"
            style={{
              padding: "8px 10px",
              background: active ? "var(--ow-bg-1)" : "transparent",
              border: active ? "1px solid var(--ow-line-2)" : "1px solid transparent",
              borderRadius: 6,
              boxShadow: active ? "var(--ow-shadow-sm)" : "none",
              opacity: dim ? 0.4 : 1,
              cursor: locked ? "default" : "pointer",
            }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <ModeIcon name={meta.icon} size={11} color={showAccentIcon ? MODE_ACCENT[m] : "var(--ow-fg-2)"} />
              <span
                className="text-xs font-semibold"
                style={{ color: active || (!locked && pristine) ? "var(--ow-fg-0)" : "var(--ow-fg-1)" }}
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

export function TimeAnchorToggle({
  value,
  onChange,
}: {
  value: TimeAnchor;
  onChange: (a: TimeAnchor) => void;
}) {
  return (
    <div
      className="flex p-1 rounded-xl text-xs font-semibold"
      style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line-2)" }}
      role="tablist"
      aria-label="Ancrage horaire"
    >
      {(
        [
          ["departure", "Heure de départ"],
          ["arrival", "Heure d'arrivée"],
        ] as const
      ).map(([m, label]) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="flex-1 px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: active ? "var(--ow-bg-1)" : "transparent",
              color: active ? "var(--ow-fg-0)" : "var(--ow-fg-2)",
              boxShadow: active ? "var(--ow-shadow-soft)" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
