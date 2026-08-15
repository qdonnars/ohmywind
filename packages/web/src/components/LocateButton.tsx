// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useState } from "react";
import type { GeolocStatus } from "../hooks/useGeolocation";
import { geolocMessage } from "../hooks/useGeolocation";

interface LocateButtonProps {
  status: GeolocStatus;
  /** Number of requests started so far. A dismissal applies to one attempt
      only, so pressing the button again re-shows a message the user closed. */
  attempt: number;
  onClick: () => void;
  /** Positioning is left to the host map so each page can dodge its own
      overlays (drawer, hero stats, data table). */
  className?: string;
}

/**
 * "Centrer sur ma position" control, shared by the explore map and the
 * planner map. Failures surface as a bubble next to the button rather than
 * a blocking dialog: a refused permission should not interrupt someone who
 * is mid-route, and it must be dismissable, since the user who just said no
 * does not need the consequence spelled out at them until they act again.
 */
export function LocateButton({ status, attempt, onClick, className = "" }: LocateButtonProps) {
  const [dismissedAttempt, setDismissedAttempt] = useState<number | null>(null);

  const message = geolocMessage(status);
  const showMessage = message !== null && dismissedAttempt !== attempt;
  const locating = status === "locating";

  return (
    // column-reverse: the button is anchored near the bottom of the map on
    // both pages, so the message has to grow upwards or it would slide under
    // the data panel.
    <div className={`absolute z-[400] flex flex-col-reverse items-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={locating}
        aria-label="Centrer sur ma position"
        title="Centrer sur ma position"
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-progress"
        style={{
          background: "var(--ow-surface-glass)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--ow-line-2)",
          color: status === "ready" ? "var(--ow-accent)" : "var(--ow-fg-1)",
        }}
      >
        {locating ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : (
          // Crosshair: the near-universal "locate me" glyph on maps.
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
          </svg>
        )}
      </button>

      {showMessage && (
        <div
          role="status"
          className="max-w-[15rem] flex items-start gap-2 pl-3 pr-2 py-2 rounded-xl text-xs animate-fade-in"
          style={{
            background: "var(--ow-surface-glass)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--ow-line-2)",
            color: "var(--ow-fg-1)",
          }}
        >
          <p className="flex-1">{message}</p>
          <button
            type="button"
            onClick={() => setDismissedAttempt(attempt)}
            aria-label="Fermer ce message"
            className="shrink-0 w-6 h-6 -mt-0.5 flex items-center justify-center rounded-md transition-opacity hover:opacity-70"
            style={{ color: "var(--ow-fg-2)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
