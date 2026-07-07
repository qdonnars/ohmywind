import { useState } from "react";

const DISMISS_KEY = "ohmywind_rebrand_banner_dismissed";

function InfoGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: "var(--ow-accent)" }}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="12" y1="7" x2="12.01" y2="7" />
    </svg>
  );
}

export function RebrandBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage unavailable (private mode): dismiss for this session only.
    }
    setDismissed(true);
  }

  return (
    <div
      className="w-full px-3 py-1.5 lg:px-6 text-xs lg:text-sm"
      style={{
        background: "var(--ow-accent-soft)",
        borderBottom: "1px solid var(--ow-accent-line)",
        color: "var(--ow-fg-0)",
      }}
    >
      <div className="flex items-center gap-2.5 max-w-screen-2xl mx-auto">
        <InfoGlyph />
        <p className="flex-1 leading-snug" style={{ color: "var(--ow-fg-1)" }}>
          <strong style={{ color: "var(--ow-fg-0)" }}>
            OpenWind devient OhMyWind.
          </strong>{" "}
          Le projet reste open source et gratuit : seul le nom change, OpenWind
          était trop proche d'autres applications. openwind.fr redirige
          automatiquement, vos plans restent accessibles.
        </p>
        <button
          onClick={close}
          aria-label="Fermer l'annonce"
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-base leading-none transition-colors hover:opacity-80"
          style={{ color: "var(--ow-fg-1)", background: "transparent" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
