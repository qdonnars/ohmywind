import { useState, type ReactNode } from "react";

// Card primitive for the /config page — extracts the recipe previously
// copy-pasted across .polar-import / .polar-eff / .polar-motor. Collapsible
// tiles reuse the PlanSidebar accordion pattern (aria-expanded + rotating
// chevron) so the two surfaces behave the same.
interface ConfigTileProps {
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ConfigTile({
  title,
  subtitle,
  collapsible = false,
  defaultOpen = true,
  children,
}: ConfigTileProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;

  const header = (
    <>
      <div className="config-tile-heading">
        <span className="config-tile-title">{title}</span>
        {subtitle && <span className="config-tile-subtitle">{subtitle}</span>}
      </div>
      {collapsible && (
        <span className={`config-tile-chevron ${open ? "is-open" : ""}`} aria-hidden>
          ▾
        </span>
      )}
    </>
  );

  return (
    <section className="config-tile">
      {collapsible ? (
        <button
          type="button"
          className="config-tile-header is-button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {header}
        </button>
      ) : (
        <div className="config-tile-header">{header}</div>
      )}
      {expanded && <div className="config-tile-body">{children}</div>}

      <style>{`
        .config-tile {
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          background: var(--ow-bg-1);
          border: 1px solid var(--ow-line-2);
        }
        .config-tile-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          text-align: left;
        }
        .config-tile-header.is-button {
          cursor: pointer;
          background: transparent;
          border: 0;
          color: inherit;
          width: 100%;
        }
        .config-tile-heading {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
        }
        .config-tile-title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .config-tile-subtitle {
          font-size: 12px;
          opacity: 0.6;
        }
        .config-tile-chevron {
          font-size: 12px;
          opacity: 0.7;
          transition: transform 150ms ease;
        }
        .config-tile-chevron.is-open {
          transform: rotate(180deg);
        }
        .config-tile-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 0 16px 16px;
        }
      `}</style>
    </section>
  );
}
