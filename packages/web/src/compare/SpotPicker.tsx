// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useT } from "../i18n";
import type { Spot } from "../types";
import { fmtNm } from "../utils/geo";
import { rowKey } from "./data";

/**
 * "Filtering" on this page means choosing one's rows: the favourites, each
 * with a tick. No weather criterion, no reordering. The same list serves
 * as the right column on a wide screen and as the panel the spots chip
 * opens on a phone.
 */
interface SpotPickerProps {
  spots: Spot[];
  /** `rowKey`s of the favourites left out. */
  hidden: ReadonlySet<string>;
  onToggle: (spot: Spot) => void;
  onAll: (pickAll: boolean) => void;
  distances?: ReadonlyMap<string, number>;
  /** "column": the wide layout's right column. "panel": the phone's inline
      card, with a close button and a bounded height. */
  variant: "column" | "panel";
  onClose?: () => void;
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const LABEL = "text-[9px] font-semibold uppercase";
const LABEL_STYLE = { letterSpacing: "0.08em", color: "var(--ow-fg-2)" } as const;

export function SpotPicker({ spots, hidden, onToggle, onAll, distances, variant, onClose }: SpotPickerProps) {
  const { t } = useT();
  const picked = spots.filter((s) => !hidden.has(rowKey(s))).length;
  const all = picked === spots.length;
  const panel = variant === "panel";

  return (
    <div
      className={panel ? "shrink-0 mx-3 mb-2 rounded-lg overflow-hidden" : "flex-1 min-h-0 flex flex-col"}
      style={panel ? { background: "var(--ow-bg-2)", border: "1px solid var(--ow-line-2)" } : undefined}
    >
      <div
        className={`flex items-center gap-2 ${panel ? "px-3 py-2" : "px-4 pt-4 pb-2.5"}`}
        style={panel ? { borderBottom: "1px solid var(--ow-line)" } : undefined}
      >
        <span className={panel ? LABEL : "text-[11px] font-semibold uppercase"} style={LABEL_STYLE}>
          {t("compare.spots.title")}
        </span>
        <span
          className="text-[10.5px] tabular-nums"
          style={{ fontFamily: "var(--ow-font-mono)", color: all ? "var(--ow-fg-2)" : "var(--ow-accent)" }}
        >
          {t("compare.spots.chipCount", { picked, total: spots.length })}
        </span>
        <button
          type="button"
          onClick={() => onAll(!all)}
          className="ml-auto text-[11.5px] font-semibold cursor-pointer"
          style={{ color: "var(--ow-accent)" }}
        >
          {all ? t("compare.spots.uncheckAll") : t("compare.spots.checkAll")}
        </button>
        {panel && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex cursor-pointer"
            style={{ color: "var(--ow-fg-2)" }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div
        className={`ow-hscroll overflow-y-auto ${panel ? "" : "flex-1 min-h-0 px-2.5"}`}
        style={panel ? { maxHeight: 168 } : undefined}
        role="group"
        aria-label={t("compare.spots.title")}
      >
        {spots.map((spot) => {
          const key = rowKey(spot);
          const on = !hidden.has(key);
          const distance = distances?.get(key);
          return (
            <button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={t("compare.spots.toggle", { name: spot.name })}
              onClick={() => onToggle(spot)}
              className={`flex w-full items-center gap-2.5 text-left cursor-pointer transition-opacity ${
                panel ? "px-3 py-2" : "px-2.5 py-[9px] rounded-lg mb-[3px]"
              }`}
              style={{
                opacity: on ? 1 : panel ? 0.45 : 0.5,
                background: !panel && on ? "var(--ow-bg-2)" : "transparent",
              }}
            >
              <span
                aria-hidden="true"
                className="shrink-0 rounded flex items-center justify-center text-[10px]"
                style={{
                  width: panel ? 16 : 15,
                  height: panel ? 16 : 15,
                  border: on ? 0 : "1.5px solid var(--ow-line-2)",
                  background: on ? "var(--ow-accent-strong)" : "transparent",
                  color: "var(--ow-on-accent)",
                }}
              >
                {on ? "✓" : ""}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block truncate font-semibold"
                  style={{ fontSize: panel ? 12.5 : 13, letterSpacing: "-0.01em", color: "var(--ow-fg-0)" }}
                >
                  {spot.name}
                </span>
                {(spot.admin1 || spot.country) && (
                  <span className="block truncate" style={{ fontSize: panel ? 10 : 10.5, color: "var(--ow-fg-2)" }}>
                    {[spot.admin1, spot.country].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {distance != null && (
                <span
                  className="shrink-0 tabular-nums"
                  style={{ fontFamily: "var(--ow-font-mono)", fontSize: panel ? 10 : 10.5, color: "var(--ow-fg-2)" }}
                >
                  {fmtNm(distance)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** "Ajouter un spot": hands the reader to the search field. */
export function AddSpotButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-surface-3 ${className}`}
      style={{
        padding: 11,
        background: "var(--ow-bg-2)",
        color: "var(--ow-fg-1)",
        border: "1px solid var(--ow-line-2)",
      }}
    >
      <PlusIcon />
      {t("compare.spots.add")}
    </button>
  );
}
