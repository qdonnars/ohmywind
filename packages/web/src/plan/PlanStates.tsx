// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Visual building blocks for the /plan right panel — keeps PlanSidebar.tsx
// focused on state wiring while these components stay design-only.

import type { PassageReport, SegmentReport } from "./types";
import { cxLevel, cxLevelVar } from "../domain/thresholds";
import { fmtDurationSafe, num1 } from "./format";
import { fmtClock } from "../domain/datetime";
import { useT } from "../i18n";

// ── EmptyState ────────────────────────────────────────────────────────────────
// Shown when fewer than 2 waypoints are placed: invites the user to draw a
// route on the map. The route bar above is dimmed (locked) until placement.

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
      <circle cx="250" cy="30" r="6" fill="var(--ow-sketch-end)" stroke="var(--ow-bg-1)" strokeWidth="2" />
      <text x="30" y="88" fontSize="9" fill="var(--ow-fg-2)" fontFamily="var(--ow-font-mono)" textAnchor="middle">A</text>
      <text x="250" y="14" fontSize="9" fill="var(--ow-fg-2)" fontFamily="var(--ow-font-mono)" textAnchor="middle">B</text>
    </svg>
  );
}

export function EmptyState() {
  const { t } = useT();
  return (
    <div className="px-2 py-6 flex flex-col gap-4">
      <RouteSketch />
      <div>
        <div
          className="text-base font-semibold mb-1.5 leading-snug"
          style={{ color: "var(--ow-fg-0)", letterSpacing: "-0.01em" }}
        >
          {t("plan.states.empty.title")}
        </div>
        <div className="text-xs leading-relaxed" style={{ color: "var(--ow-fg-1)" }}>
          {t("plan.states.empty.body")}
        </div>
      </div>
    </div>
  );
}

// ── HeroStats + SegmentBar ────────────────────────────────────────────────────
// 4-cell stats row with a segmented complexity bar underneath; matches the
// design's "Sim filled" header block.

export function HeroCell({
  label,
  value,
  unit,
  tone,
  size = "md",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "warn" | "accent" | "default";
  /** `lg` is the drawer head on mobile (StatBand): the three totals are the
      headline there, not one block among the results. */
  size?: "md" | "lg";
}) {
  const color =
    tone === "warn" ? "var(--ow-warn)" :
    tone === "accent" ? "var(--ow-accent)" :
    "var(--ow-fg-0)";
  const large = size === "lg";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: "var(--ow-fg-2)" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`${large ? "text-[28px]" : "text-xl"} font-bold tabular-nums`}
          style={{ color, letterSpacing: large ? "-0.03em" : "-0.02em", lineHeight: 1, fontFamily: "var(--ow-font-mono)" }}
        >
          {value}
        </span>
        {unit && (
          <span className={large ? "text-xs" : "text-[10px]"} style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// One cell per server step, wide in proportion to its distance. With
// `onSegmentClick` every cell is a button: a click opens the leg the step
// belongs to and that step in the card, the same thing the strip under an
// open leg does, reached from the overview instead. The visible bar stays
// 8 px thin; the button around it carries the 16 px touch height.
function SegmentBar({
  segments,
  legRanges,
  focusedSegmentIdx,
  onSegmentClick,
}: {
  segments: SegmentReport[];
  legRanges?: Array<[number, number]>;
  focusedSegmentIdx?: number | null;
  onSegmentClick?: (segIdx: number, legIdx: number) => void;
}) {
  const { t } = useT();
  const total = segments.reduce((s, seg) => s + seg.distance_nm, 0);
  const legOf = (i: number): number =>
    legRanges ? legRanges.findIndex(([s, e]) => i >= s && i < e) : -1;
  const label = (seg: SegmentReport, i: number, leg: number): string => {
    const when = {
      start: fmtClock(seg.start_time),
      end: fmtClock(seg.end_time),
      tws: Math.round(seg.tws_kn),
    };
    if (leg < 0 || !legRanges) return t("plan.segmentBar.timeLabel", when);
    const [s, e] = legRanges[leg];
    return t("plan.segmentBar.stepLabel", {
      from: leg + 1,
      to: leg + 2,
      index: i - s + 1,
      total: e - s,
      ...when,
    });
  };
  return (
    <div
      className="flex gap-[1px]"
      role={onSegmentClick ? "group" : "progressbar"}
      aria-label={
        onSegmentClick
          ? t("plan.segmentBar.groupLabel")
          : t("plan.segmentBar.progressLabel")
      }
    >
      {segments.map((seg, i) => {
        const leg = legOf(i);
        const focused = focusedSegmentIdx === i;
        const cell = (
          <span
            className="block h-2 rounded-sm"
            style={{
              background: cxLevelVar(cxLevel(seg.tws_kn)),
              outline: focused ? "2px solid var(--ow-accent)" : "none",
              outlineOffset: 1,
            }}
          />
        );
        const size = { width: `${(seg.distance_nm / total) * 100}%`, minWidth: 2 };
        if (!onSegmentClick) {
          return <div key={i} style={size}>{cell}</div>;
        }
        const text = label(seg, i, leg);
        return (
          <button
            key={i}
            type="button"
            title={text}
            aria-label={text}
            aria-pressed={focused}
            onClick={() => onSegmentClick(i, leg)}
            className="py-1 cursor-pointer transition-opacity hover:opacity-80"
            style={size}
          >
            {cell}
          </button>
        );
      })}
    </div>
  );
}

export function HeroStats({
  passage,
  legRanges,
  focusedSegmentIdx,
  onSegmentClick,
}: {
  passage: PassageReport;
  /** Segment ranges of the legs, so a cell of the bar knows its leg. */
  legRanges?: Array<[number, number]>;
  /** Passage-wide index of the step open in the panel, ringed in the bar. */
  focusedSegmentIdx?: number | null;
  /** Makes the bar clickable. */
  onSegmentClick?: (segIdx: number, legIdx: number) => void;
}) {
  const { t } = useT();
  // Complexity isn't a tile any more — the colored segment bar below already
  // tells the same story (per-leg wind buckets) without a redundant number.
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <HeroCell label={t("plan.hero.distance")} value={num1(passage.distance_nm)} unit="nm" />
        <HeroCell label={t("plan.hero.duration")} value={fmtDurationSafe(passage.duration_h)} />
        <HeroCell label={t("plan.hero.arrival")} value={fmtClock(passage.arrival_time)} />
      </div>
      <SegmentBar
        segments={passage.segments}
        legRanges={legRanges}
        focusedSegmentIdx={focusedSegmentIdx}
        onSegmentClick={onSegmentClick}
      />
      <div
        className="flex justify-between mt-1 text-[9px] tabular-nums"
        style={{ color: "var(--ow-fg-2)", fontFamily: "var(--ow-font-mono)" }}
      >
        <span>&lt;10 · 10–15 · 15–20 · 20–25 · &gt;25 kn</span>
      </div>
    </div>
  );
}

// ── StatBand ──────────────────────────────────────────────────────────────────
// The three totals as the head of the mobile drawer: Distance / Durée /
// Arrivée in large type, the arrival in accent. It sits in the drawer chrome
// (under the grab handle, above the scrolling content), so it stays on screen
// whether the drawer is a peek or pulled all the way up. It replaces the glass
// strip that used to float over the map: the strip hid the bottom of the
// route the map had just framed (#392). Desktop keeps HeroStats above, with
// the segment bar, in the sidebar.

export function StatBand({ passage }: { passage: PassageReport }) {
  const { t } = useT();
  const divider = { borderLeft: "1px solid var(--ow-line)" };
  return (
    <div className="grid grid-cols-3 px-4 pt-0.5 pb-3.5" style={{ borderBottom: "1px solid var(--ow-line)" }}>
      <HeroCell size="lg" label={t("plan.hero.distance")} value={num1(passage.distance_nm)} unit="nm" />
      <div className="pl-3.5" style={divider}>
        <HeroCell size="lg" label={t("plan.hero.duration")} value={fmtDurationSafe(passage.duration_h)} />
      </div>
      <div className="pl-3.5" style={divider}>
        <HeroCell size="lg" tone="accent" label={t("plan.hero.arrival")} value={fmtClock(passage.arrival_time)} />
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
// "Modifier" affordance. Click toggles the inline editor below. `trailing`
// is a control of its own, past a divider, outside the button (a button
// cannot nest one): the trash of a filled view lives there, so it stays
// reachable however low the mobile drawer sits. The two texts wrap as a
// unit: when the row is tight the boat drops under the date whole, rather
// than each label breaking mid-word.

export function RecapButton({
  primary,
  secondary,
  isOpen,
  onClick,
  trailing,
}: {
  primary: string;
  secondary: string;
  isOpen: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div
      className="flex items-stretch"
      style={{
        background: "var(--ow-bg-2)",
        borderTop: "1px solid var(--ow-line)",
        borderBottom: "1px solid var(--ow-line)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-4 py-2.5 transition-colors"
        style={{ textAlign: "left" }}
        aria-expanded={isOpen}
      >
        <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: "var(--ow-fg-0)", fontFamily: "var(--ow-font-mono)" }}
          >
            {primary}
          </span>
          <span className="text-[11px] font-medium" style={{ color: "var(--ow-fg-1)" }}>
            <span className="text-[10px] mr-2" style={{ color: "var(--ow-fg-3)" }}>·</span>
            {secondary}
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--ow-fg-1)" }}>
          {isOpen ? t("common.close") : t("plan.recap.edit")}
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
      {trailing && (
        <div className="shrink-0 flex items-center gap-2.5 pr-3">
          <span aria-hidden="true" className="block w-px h-5" style={{ background: "var(--ow-line-2)" }} />
          {trailing}
        </div>
      )}
    </div>
  );
}
