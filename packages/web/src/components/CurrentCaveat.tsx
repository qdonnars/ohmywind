// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The warning under the currents table, on one line.
 *
 * It was three sentences in yellow on black, always open: what is wrong,
 * why, and what we are doing about it, under a table two rows high. The
 * sailor needs the first at a glance (« the currents here are probably
 * wrong »), and the rest only once, so the line says what and where, and
 * unfolds on a tap into the full sentence and the way to the method.
 *
 * Painted on the panel's own ground under the soft warning fill, never
 * translucent: the panel floats over the map.
 */

import { useState, type ReactNode } from "react";
import { AlertIcon } from "./AlertChip";
import { ChevronIcon } from "../plan/compare/icons";
import { useT } from "../i18n";

export function CurrentCaveat({ headline, children }: { headline: string; children: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="shrink-0 border-t"
      style={{
        background: "linear-gradient(var(--ow-warn-soft), var(--ow-warn-soft)), var(--ow-bg-1)",
        borderColor: "var(--ow-warn-line)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-1.5 text-left text-[11.5px] font-semibold leading-snug"
        style={{ color: "var(--ow-warn-ink)" }}
      >
        <span className="shrink-0 flex">
          <AlertIcon size={12} />
        </span>
        <span className="min-w-0 flex-1">{headline}</span>
        <span className="shrink-0 flex">
          <ChevronIcon direction={open ? "down" : "right"} size={10} />
        </span>
      </button>
      {open && (
        <div className="px-5 pb-2 text-[11px] leading-snug" style={{ color: "var(--ow-fg-1)" }}>
          <p className="m-0">{children}</p>
          <a
            href="/methodologie/courants"
            className="inline-block mt-1 font-semibold underline underline-offset-2"
            style={{ color: "var(--ow-warn-ink)" }}
          >
            {t("explore.marineTable.caveat.method")}
          </a>
        </div>
      )}
    </div>
  );
}
