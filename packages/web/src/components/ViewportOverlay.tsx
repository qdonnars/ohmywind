// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { createPortal } from "react-dom";

/**
 * A modal backdrop pinned to the part of the screen the reader can see.
 *
 * With the keyboard closed that is the whole screen. With it open, it is what
 * is left above the keys, so a dialog centred in it keeps its field and its
 * buttons in sight (#569): see `viewport/visibleViewport.ts` for where the
 * box comes from. Its content is centred with `m-auto` rather than by the
 * flex alignment, so a dialog taller than a landscape phone with its keyboard
 * up scrolls from its top instead of losing it above the screen.
 *
 * Rendered into `<body>`: a `position: fixed` box inside an ancestor that
 * carries a transform or a filter is placed against that ancestor, not
 * against the screen, and the map and its panels may well carry one.
 */
export function ViewportOverlay({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      role="dialog"
      aria-label={label}
      className={`ow-visible-viewport fixed inset-x-0 z-[1000] flex overflow-y-auto overscroll-contain p-4 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
