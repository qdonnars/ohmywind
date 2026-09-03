// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo } from "react";
import { beaufortLevel, windLevelVar } from "../domain/thresholds";

interface WindCellProps {
  /** The hour this cell reads, handed back to `onSelect`. */
  time: string;
  speed: number | null;
  gusts: number | null;
  direction: number | null;
  selected: boolean;
  isNow: boolean;
  isDayStart?: boolean;
  /** Takes the hour rather than closing over it, so the parent can pass one
      stable function for the whole table instead of one closure per cell.
      Without that, `memo` below would miss on every render. */
  onSelect: (time: string) => void;
}

function WindCellImpl({ time, speed, gusts, direction, selected, isNow, isDayStart, onSelect }: WindCellProps) {
  // `isNow` border takes precedence over the day separator (the now marker is more salient).
  const nowBorder = isNow ? "border-l-2 border-l-accent" : "";
  const daySepClass = !isNow && isDayStart ? "ow-day-sep" : "";
  const selectedStyle = selected ? "ring-2 ring-accent/70 ring-inset bg-accent/10" : "";

  if (speed == null) {
    return (
      <td
        role="cell"
        className={`wind-cell ow-null-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center text-xs align-middle cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
        onClick={() => onSelect(time)}
      >
        —
      </td>
    );
  }

  const level = beaufortLevel(speed);
  const bg = windLevelVar(level);
  const color = `var(--ow-cell-text-${level})`;

  const gustClose = gusts != null && gusts <= speed + 5;
  const gustOpacity = gustClose ? "opacity-70" : "opacity-90";

  return (
    <td
      role="cell"
      className={`wind-cell min-w-[32px] lg:min-w-[56px] h-10 lg:h-14 text-center align-middle p-0 cursor-pointer ${nowBorder} ${daySepClass} ${selectedStyle}`}
      style={{ backgroundColor: bg, color }}
      onClick={() => onSelect(time)}
      aria-label={`${Math.round(speed)} knots${gusts != null ? `, gusts ${Math.round(gusts)}` : ""}${direction != null ? `, direction ${direction}°` : ""}`}
    >
      <div className="flex flex-col items-center justify-center leading-none gap-[2px]">
        {/* Row 1: arrow + speed (+ unit on desktop) */}
        <div className="flex items-center gap-0.5">
          {direction != null && (
            <svg
              width="11"
              height="11"
              className="lg:w-[14px] lg:h-[14px] shrink-0"
              viewBox="0 0 16 16"
              style={{ transform: `rotate(${direction + 180}deg)`, transition: "transform 0.3s ease" }}
            >
              <polygon points="8,1 13,15 8,10 3,15" fill="currentColor" />
            </svg>
          )}
          <span className="text-[17px] lg:text-[16px] font-bold tabular-nums leading-none">
            {Math.round(speed)}
            <span className="hidden lg:inline ml-0.5 text-[10px] font-medium opacity-60">
              kn
            </span>
          </span>
        </div>
        {/* Row 2: gust */}
        {gusts != null && (
          <span className={`text-[10px] lg:text-[11px] font-semibold tabular-nums leading-none ${gustOpacity}`}>
            ↑{Math.round(gusts)}
          </span>
        )}
      </div>
    </td>
  );
}

/**
 * A 7-day timeline is 168 cells per model, so tapping one hour used to
 * re-render close to 700 of them to change two. Every prop here is a scalar,
 * which makes the default shallow comparison exactly right.
 */
export const WindCell = memo(WindCellImpl);
