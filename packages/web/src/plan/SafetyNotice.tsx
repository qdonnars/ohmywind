// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// ── SafetyNotice ─────────────────────────────────────────────────────────────
// Persistent usage warning on the plan view. Deliberately not dismissible and
// not a toast: it qualifies the ETA and the complexity score the user is about
// to act on, so it has to survive as long as those numbers are on screen.
// Rendered at the bottom of both sidebar containers (desktop column, mobile
// drawer), which is where the figures it qualifies are read. Sticky rather
// than merely last, so it stays on screen without scrolling to the end of a
// long leg list. The warn background is mixed against --ow-bg-1 (the shared
// background of both containers) instead of using --ow-warn-soft directly:
// that token is 12 % alpha and content would scroll through it.
//
// The same text lives in three places, on purpose: here, in the README, and in
// the `disclaimer` field of every `plan_passage` payload. Keep them in sync.
export function SafetyNotice() {
  return (
    <div
      className="sticky bottom-0 z-10 px-4 py-3 text-[11px] leading-relaxed"
      style={{
        background: "color-mix(in srgb, var(--ow-warn) 12%, var(--ow-bg-1))",
        borderTop: "1px solid var(--ow-warn-line)",
        color: "var(--ow-fg-1)",
      }}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--ow-warn)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M8 2 14 13H2z" />
          <path d="M8 7v3" />
          <circle cx="8" cy="12" r="0.5" fill="var(--ow-warn)" />
        </svg>
        Aide à la décision, pas un instrument de navigation.
      </span>{" "}
      OhMyWind ne remplace ni le bulletin météo marine officiel, ni des cartes à
      jour, ni votre jugement de chef de bord. Les modèles se trompent parfois :
      vous restez responsable de votre navigation.
    </div>
  );
}
