// Visual building blocks for the /plan right panel — keeps PlanSidebar.tsx
// focused on state wiring while these components stay design-only.

import type { PassageReport, SegmentReport } from "./types";
import { CX_COLORS, cxLevel } from "./types";

// ── EmptyState ────────────────────────────────────────────────────────────────
// Shown when fewer than 2 waypoints are placed: invites the user to draw a
// route on the map. The mode tabs above are dimmed (locked) until placement.

export function RouteSketch() {
  return (
    <svg viewBox="0 0 280 100" className="w-full" style={{ maxHeight: 110 }} aria-hidden="true">
      <defs>
        <pattern id="ow-dots-bg" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="var(--ow-line-2)" />
        </pattern>
      </defs>
      <rect width="280" height="100" fill="url(#ow-dots-bg)" opacity="0.6" />
      <path
        d="M30 70 Q 90 30 150 50 T 250 30"
        stroke="var(--ow-accent)"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 4"
      />
      <circle cx="30" cy="70" r="6" fill="var(--ow-accent)" stroke="var(--ow-bg-1)" strokeWidth="2" />
      <circle cx="250" cy="30" r="6" fill="#FF7A59" stroke="var(--ow-bg-1)" strokeWidth="2" />
      <text x="30" y="88" fontSize="9" fill="var(--ow-fg-2)" fontFamily="var(--ow-font-mono)" textAnchor="middle">A</text>
      <text x="250" y="14" fontSize="9" fill="var(--ow-fg-2)" fontFamily="var(--ow-font-mono)" textAnchor="middle">B</text>
    </svg>
  );
}

export function EmptyState() {
  return (
    <div className="px-2 py-6 flex flex-col gap-4">
      <RouteSketch />
      <div>
        <div
          className="text-base font-semibold mb-1.5 leading-snug"
          style={{ color: "var(--ow-fg-0)", letterSpacing: "-0.01em" }}
        >
          Tracez votre trajet
        </div>
        <div className="text-xs leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          Cliquez sur la carte pour placer un départ et une arrivée. Vous pourrez ensuite simuler le temps du trajet ou comparer plusieurs créneaux de départ.
        </div>
      </div>
    </div>
  );
}

// ── ModePicker ────────────────────────────────────────────────────────────────
// Once 2 waypoints are placed and no mode has been chosen yet (first-time
// flow), surface the 2 big "narrative" cards rather than the bare tab toggle.

function PickerIcon({ name, color }: { name: "route" | "clock"; color: string }) {
  if (name === "clock") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12c2-4 5-1 7-3 1-1 2-3 3-3" />
      <circle cx="3" cy="12" r="1.5" fill={color} stroke="none" />
      <circle cx="13" cy="6" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

function BigCard({
  icon,
  accent,
  title,
  body,
  example,
  onClick,
}: {
  icon: "route" | "clock";
  accent: string;
  title: string;
  body: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3.5 transition-all"
      style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ background: accent, color: "#0B1A14" }}
        >
          <PickerIcon name={icon} color="#0B1A14" />
        </span>
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--ow-fg-0)", letterSpacing: "-0.005em" }}
        >
          {title}
        </div>
        <span className="ml-auto" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ow-fg-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </span>
      </div>
      <div className="text-xs leading-relaxed mb-1.5" style={{ color: "var(--ow-fg-1)" }}>
        {body}
      </div>
      <div className="text-[10px] italic" style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}>
        {example}
      </div>
    </button>
  );
}

export function ModePicker({
  onPick,
}: {
  onPick: (m: "single" | "compare") => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="text-base font-semibold"
        style={{ color: "var(--ow-fg-0)", letterSpacing: "-0.005em" }}
      >
        Que voulez-vous faire&nbsp;?
      </div>
      <BigCard
        icon="route"
        accent="var(--ow-accent)"
        title="Simuler ma route"
        body="Vous savez quand partir. OpenWind calcule le temps du trajet, l'ETA et les conditions sur chaque segment."
        example="Ex. — « Si je pars samedi 17:00, j'arrive quand ? »"
        onClick={() => onPick("single")}
      />
      <BigCard
        icon="clock"
        accent="#F4C25C"
        title="Comparer les fenêtres"
        body="Vous savez où aller. OpenWind teste plusieurs heures de départ et classe les créneaux par confort."
        example="Ex. — « Quel est le meilleur départ entre samedi et lundi ? »"
        onClick={() => onPick("compare")}
      />
    </div>
  );
}

// ── HeroStats + SegmentBar ────────────────────────────────────────────────────
// 4-cell stats row with a segmented complexity bar underneath; matches the
// design's "Sim filled" header block.

function fmtDuration(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, "0")}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function HeroCell({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "warn" | "accent" | "default";
}) {
  const color =
    tone === "warn" ? "var(--ow-warn)" :
    tone === "accent" ? "var(--ow-accent)" :
    "var(--ow-fg-0)";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: "var(--ow-fg-2)" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-xl font-bold tabular-nums"
          style={{ color, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "var(--ow-font-mono)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10px]" style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function SegmentBar({ segments }: { segments: SegmentReport[] }) {
  const total = segments.reduce((s, seg) => s + seg.distance_nm, 0);
  return (
    <div className="flex h-2 rounded-sm overflow-hidden gap-[1px]" role="progressbar" aria-label="Distribution du vent par segment">
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{
            width: `${(seg.distance_nm / total) * 100}%`,
            background: CX_COLORS[cxLevel(seg.tws_kn)],
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}

export function HeroStats({
  passage,
}: {
  passage: PassageReport;
}) {
  // Complexity isn't a tile any more — the colored segment bar below already
  // tells the same story (per-leg wind buckets) without a redundant number.
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <HeroCell label="Distance" value={passage.distance_nm.toFixed(1)} unit="nm" />
        <HeroCell label="Durée" value={fmtDuration(passage.duration_h)} />
        <HeroCell label="Arrivée" value={fmtTime(passage.arrival_time)} />
      </div>
      <SegmentBar segments={passage.segments} />
      <div
        className="flex justify-between mt-1.5 text-[9px] tabular-nums"
        style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
      >
        <span>&lt;10 · 10–15 · 15–20 · 20–25 · &gt;25 kn</span>
      </div>
    </div>
  );
}

// ── Warn ──────────────────────────────────────────────────────────────────────
// Single-line warning row matching the design's "Warn" component (alert icon
// + soft warn background).

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] leading-tight"
      style={{
        background: "var(--ow-warn-soft)",
        border: "1px solid var(--ow-warn-line)",
        color: "var(--ow-fg-1)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--ow-warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M8 2 14 13H2z" />
        <path d="M8 7v3" />
        <circle cx="8" cy="12" r="0.5" fill="var(--ow-warn)" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

// ── RecapButton ───────────────────────────────────────────────────────────────
// Compact summary of the active form (departure time / archetype) with a
// "Modifier" affordance. Click toggles the inline editor below.

export function RecapButton({
  primary,
  secondary,
  isOpen,
  onClick,
}: {
  primary: string;
  secondary: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors"
      style={{
        background: "var(--ow-bg-2)",
        borderTop: "1px solid var(--ow-line)",
        borderBottom: "1px solid var(--ow-line)",
        textAlign: "left",
      }}
      aria-expanded={isOpen}
    >
      <span
        className="text-xs font-bold tabular-nums"
        style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}
      >
        {primary}
      </span>
      <span className="text-[10px]" style={{ color: "var(--ow-fg-3)" }}>·</span>
      <span className="text-[11px] font-medium" style={{ color: "var(--ow-fg-1)" }}>
        {secondary}
      </span>
      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--ow-fg-1)" }}>
        {isOpen ? "Fermer" : "Modifier"}
        <svg
          width="9"
          height="9"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
        >
          <path d="M3 6l5 5 5-5" />
        </svg>
      </span>
    </button>
  );
}
