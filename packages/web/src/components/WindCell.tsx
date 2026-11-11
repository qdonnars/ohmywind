// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { memo, type CSSProperties } from "react";
import { beaufortLevel, windSoftVar, windTextVar } from "../domain/thresholds";
import { t, useLang } from "../i18n";
import { DirectionArrow } from "./DirectionArrow";

interface WindCellProps {
  /** The hour this cell reads, handed back to `onSelect`. */
  time: string;
  speed: number | null;
  gusts: number | null;
  direction: number | null;
  selected: boolean;
  /** The models disagree on the direction at this hour: the table's single
      direction row stands aside, and each model shows its own arrow here. */
  showDirection: boolean;
  /** Where the cell sits in the grid, for the rounded row ends and for the
      outline of the picked hour, which closes at the top of the first model
      and at the bottom of the last. */
  firstRow: boolean;
  lastRow: boolean;
  firstCol: boolean;
  lastCol: boolean;
  /** Takes the hour rather than closing over it, so the parent can pass one
      stable function for the whole table instead of one closure per cell.
      Without that, `memo` below would miss on every render. */
  onSelect: (time: string) => void;
}

/**
 * The cell read aloud, as one sentence per shape rather than three fragments
 * glued together: "rafales" and "direction" do not sit in the same order in
 * every language, and a sentence assembled from pieces cannot be translated.
 */
function ariaLabel(speed: number, gusts: number | null, direction: number | null): string {
  const knots = Math.round(speed);
  if (gusts != null && direction != null) {
    return t("explore.windCell.aria.speedGustsDirection", {
      speed: knots,
      gusts: Math.round(gusts),
      direction,
    });
  }
  if (gusts != null) {
    return t("explore.windCell.aria.speedGusts", { speed: knots, gusts: Math.round(gusts) });
  }
  if (direction != null) {
    return t("explore.windCell.aria.speedDirection", { speed: knots, direction });
  }
  return t("explore.windCell.aria.speed", { speed: knots });
}

/**
 * The fill's shape: rounded at the two ends of the row only, the cells in
 * between touching so a model reads as one band; and the picked hour drawn as
 * a 2 px outline around the whole column. The outline is an inset shadow on
 * the fill, not a border, so it never shifts the grid by a pixel.
 */
function fillShape(p: Pick<WindCellProps, "selected" | "firstRow" | "lastRow" | "firstCol" | "lastCol">): CSSProperties {
  const r = 7;
  const borderRadius = `${p.firstCol ? r : 0}px ${p.lastCol ? r : 0}px ${p.lastCol ? r : 0}px ${p.firstCol ? r : 0}px`;
  if (!p.selected) return { borderRadius };
  const ink = "var(--ow-fg-0)";
  const edges = [`inset 2px 0 0 ${ink}`, `inset -2px 0 0 ${ink}`];
  if (p.firstRow) edges.push(`inset 0 2px 0 ${ink}`);
  if (p.lastRow) edges.push(`inset 0 -2px 0 ${ink}`);
  return { borderRadius, boxShadow: edges.join(", ") };
}

// The fill lives on an inner block rather than on the <td>: a collapsed table
// ignores border-radius on its cells, and the 2 px between two models is the
// cell's top padding showing the panel through.
const TD_CLASS =
  "wind-cell p-0 pt-[2px] align-middle cursor-pointer min-w-[38px] lg:min-w-[52px]";
const FILL_CLASS =
  "h-[42px] lg:h-[48px] w-full flex flex-col items-center justify-center gap-[2px] leading-none";

function WindCellImpl({
  time,
  speed,
  gusts,
  direction,
  selected,
  showDirection,
  firstRow,
  lastRow,
  firstCol,
  lastCol,
  onSelect,
}: WindCellProps) {
  // Subscribes the cell to the language, so a switch relabels the whole table.
  useLang();
  const shape = fillShape({ selected, firstRow, lastRow, firstCol, lastCol });

  if (speed == null) {
    return (
      <td role="cell" className={TD_CLASS} onClick={() => onSelect(time)}>
        <div className={`${FILL_CLASS} ow-null-cell text-xs`} style={shape}>
          —
        </div>
      </td>
    );
  }

  const level = beaufortLevel(speed);
  const ownArrow = showDirection && direction != null;

  return (
    <td
      role="cell"
      className={TD_CLASS}
      onClick={() => onSelect(time)}
      aria-label={ariaLabel(speed, gusts, direction)}
    >
      <div
        className={FILL_CLASS}
        style={{ ...shape, background: windSoftVar(level), color: windTextVar(level) }}
      >
        <span
          className="text-[15px] lg:text-[16px] font-bold tabular-nums"
          style={{ letterSpacing: "-0.02em" }}
        >
          {Math.round(speed)}
        </span>
        {(gusts != null || ownArrow) && (
          <span className="flex items-center gap-[2px] text-[9.5px] lg:text-[10px] font-semibold tabular-nums">
            {showDirection && direction != null && (
              <DirectionArrow deg={direction} from size={9} className="lg:w-[10px] lg:h-[10px]" />
            )}
            {gusts != null && <span style={{ opacity: 0.7 }}>↑{Math.round(gusts)}</span>}
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
