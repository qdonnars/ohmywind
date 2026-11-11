// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

interface DirectionArrowProps {
  /** Compass bearing in degrees. */
  deg: number;
  /** True when `deg` says where the flow comes from (wind, sea): the arrow
      then turns half a circle to point where it goes, which is what the eye
      follows. False for a current, already given as where it goes. */
  from: boolean;
  /** Size on a phone; `className` can widen it past the breakpoint. */
  size: number;
  className?: string;
}

/**
 * The thin filled arrow of the explore tables, in the current colour.
 *
 * Decorative: every cell that draws one also says the bearing in its label,
 * so a screen reader hears a number rather than "image".
 */
export function DirectionArrow({ deg, from, size, className }: DirectionArrowProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`shrink-0 ${className ?? ""}`}
      style={{ transform: `rotate(${from ? deg + 180 : deg}deg)` }}
      aria-hidden="true"
    >
      <path d="M8 1.5 13 14.5 8 10.8 3 14.5Z" fill="currentColor" />
    </svg>
  );
}
