// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { InfoPanel } from "./InfoPanel";

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="12" y1="7" x2="12.01" y2="7" />
    </svg>
  );
}

function InfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal the overlay to <body> so its z-index isn't trapped by a parent
  // stacking context (the header uses backdrop-blur-lg, which creates one).
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end lg:items-center justify-center animate-fade-in"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.6)" }}
      role="dialog"
      aria-modal="true"
      aria-label="À propos d'OhMyWind"
    >
      <div
        className="relative w-full lg:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl lg:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--ow-bg-0)",
          border: "1px solid var(--ow-line)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-base font-semibold transition-colors"
          style={{
            background: "var(--ow-bg-1)",
            color: "var(--ow-fg-1)",
            border: "1px solid var(--ow-line)",
          }}
        >
          ✕
        </button>
        <InfoPanel />
      </div>
    </div>,
    document.body,
  );
}

export function InfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="À propos d'OhMyWind"
        title="À propos"
        className="shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors"
        style={{ color: "var(--ow-fg-1)", background: "transparent" }}
      >
        <InfoIcon />
      </button>
      {open && <InfoModal onClose={() => setOpen(false)} />}
    </>
  );
}
