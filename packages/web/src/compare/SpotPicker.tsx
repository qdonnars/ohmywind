// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { Spot } from "../types";
import { fmtNm } from "../utils/geo";
import { rowKey } from "./data";

/**
 * "Filtering" on this page means choosing one's rows: the favourites, each
 * with a tick. No weather criterion, no reordering. The panel the « Spots »
 * chip unfolds under the row of settings, at every width: in the flow on a
 * phone, the table under it; from lg up hanging under the chip, at the right
 * end of the row, over the table. Escape closes it, as its cross does.
 */
interface SpotPickerProps {
  spots: Spot[];
  /** `rowKey`s of the favourites left out. */
  hidden: ReadonlySet<string>;
  onToggle: (spot: Spot) => void;
  onAll: (pickAll: boolean) => void;
  distances?: ReadonlyMap<string, number>;
  /** Rank of each favourite, by `rowKey`: the digit the map puts inside the
      marker and the table repeats before the name. */
  numbers?: ReadonlyMap<string, number>;
  onClose: () => void;
  /** The panel's last row, « Ajouter un spot »: the list is where one looks
      for the way to grow it. */
  onAdd?: () => void;
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

export function SpotPicker({
  spots,
  hidden,
  onToggle,
  onAll,
  distances,
  numbers,
  onClose,
  onAdd,
}: SpotPickerProps) {
  const { t } = useT();
  const picked = spots.filter((s) => !hidden.has(rowKey(s))).length;
  const all = picked === spots.length;

  // The panel holds about five rows and scrolls past them, which an
  // iPhone does not show: with six spots the sixth was out of sight with
  // nothing to say so. A fade over the bottom of the list says there is more
  // to slide to, and goes once the end is reached.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);
  useLayoutEffect(measure, [measure, spots.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="shrink-0 mx-3 mb-2 lg:absolute lg:z-[2] lg:top-full lg:right-5 lg:m-0 lg:w-[360px] lg:shadow-[var(--ow-shadow-2)] rounded-lg overflow-hidden"
      style={{ background: "var(--ow-bg-2)", border: "1px solid var(--ow-line-2)" }}
    >
      {/* The two buttons of the head are 44 px tall and the close one as
          wide, for a thumb: the row is as tall as they are. */}
      <div className="flex items-center gap-2 pl-3" style={{ borderBottom: "1px solid var(--ow-line)" }}>
        <span className={LABEL} style={LABEL_STYLE}>
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
          className="ml-auto min-h-[44px] px-1 text-[11.5px] font-semibold cursor-pointer"
          style={{ color: "var(--ow-accent)" }}
        >
          {all ? t("compare.spots.uncheckAll") : t("compare.spots.checkAll")}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="shrink-0 w-11 h-11 flex items-center justify-center cursor-pointer"
          style={{ color: "var(--ow-fg-2)" }}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="relative">
        <div
          ref={listRef}
          onScroll={measure}
          className="ow-hscroll overflow-y-auto relative"
          style={{ maxHeight: 168 }}
          role="group"
          aria-label={t("compare.spots.title")}
        >
          {spots.map((spot) => {
            const key = rowKey(spot);
            const on = !hidden.has(key);
            const distance = distances?.get(key);
            const number = numbers?.get(key);
            return (
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={t("compare.spots.toggle", { name: spot.name })}
                onClick={() => onToggle(spot)}
                className="flex w-full items-center gap-2.5 text-left cursor-pointer transition-opacity px-3 py-2"
                style={{ opacity: on ? 1 : 0.45 }}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded flex items-center justify-center text-[10px]"
                  style={{
                    width: 16,
                    height: 16,
                    border: on ? 0 : "1.5px solid var(--ow-line-2)",
                    background: on ? "var(--ow-accent-strong)" : "transparent",
                    color: "var(--ow-on-accent)",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                {number != null && (
                  <span
                    aria-hidden="true"
                    className="shrink-0 rounded-full flex items-center justify-center"
                    style={{
                      width: 16,
                      height: 16,
                      background: "var(--ow-accent-strong)",
                      color: "var(--ow-on-accent)",
                      fontFamily: "var(--ow-font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {number}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span
                    className="block truncate font-semibold"
                    style={{ fontSize: 12.5, letterSpacing: "-0.01em", color: "var(--ow-fg-0)" }}
                  >
                    {spot.name}
                  </span>
                  {(spot.admin1 || spot.country) && (
                    <span className="block truncate" style={{ fontSize: 10, color: "var(--ow-fg-2)" }}>
                      {[spot.admin1, spot.country].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {distance != null && (
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ fontFamily: "var(--ow-font-mono)", fontSize: 10, color: "var(--ow-fg-2)" }}
                  >
                    {fmtNm(distance)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {more && (
          <div
            aria-hidden="true"
            data-testid="spots-more-fade"
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ height: 40, background: "linear-gradient(to bottom, transparent, var(--ow-bg-2))" }}
          />
        )}
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2 text-[12.5px] font-semibold cursor-pointer"
          style={{ color: "var(--ow-accent)", borderTop: "1px solid var(--ow-line)" }}
        >
          <PlusIcon />
          {t("compare.spots.add")}
        </button>
      )}
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

/** "Ajouter un spot": hands the reader to the search field, in the empty
    page's notice. */
export function AddSpotButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-lg font-medium cursor-pointer transition-colors hover:bg-surface-3 ${className}`}
      style={{
        padding: 11,
        fontSize: 13,
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
