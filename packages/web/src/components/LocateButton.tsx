import type { GeolocStatus } from "../hooks/useGeolocation";
import { geolocMessage } from "../hooks/useGeolocation";

interface LocateButtonProps {
  status: GeolocStatus;
  onClick: () => void;
  /** Positioning is left to the host map so each page can dodge its own
      overlays (drawer, hero stats, zoom control). */
  className?: string;
}

/**
 * "Centrer sur ma position" control, shared by the explore map and the
 * planner map. Failures surface as a bubble next to the button rather than
 * a blocking dialog: a refused permission should not interrupt someone who
 * is mid-route. The bubble is a pure function of the status, so it clears
 * itself as soon as the user retries rather than on a timer the user
 * cannot see.
 */
export function LocateButton({ status, onClick, className = "" }: LocateButtonProps) {
  const message = geolocMessage(status);
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

      {message && (
        <p
          role="status"
          className="max-w-[15rem] px-3 py-2 rounded-xl text-xs animate-fade-in"
          style={{
            background: "var(--ow-surface-glass)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--ow-line-2)",
            color: "var(--ow-fg-1)",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
