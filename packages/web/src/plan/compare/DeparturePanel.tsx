// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The one setting of the track axis: the departure, frozen for every
 * option. Same pinned row and same panel as the window of the departure
 * axis, with one bound instead of two. Applying it recomputes the plan and
 * every option.
 */

import { useCallback, useMemo, useState } from "react";
import { usePlan } from "../session/planContext";
import { useBackDismiss } from "../../hooks/useBackDismiss";
import { SWEEP_HORIZON_DAYS } from "../validateSweep";
import { ContextRow } from "./ContextRow";
import { BoundField } from "./WindowPanel";
import { ClockIcon } from "./icons";
import { capitalise, fmtClock, fmtDay, toNaiveLocal } from "../../domain/datetime";
import { useT } from "../../i18n";

const MONO = { fontFamily: "var(--ow-font-mono)" } as const;

export function DepartureSettings({ placement = "above" }: { placement?: "above" | "below" }) {
  const { t, tn } = useT();
  const { state, actions } = usePlan();
  const { departure, timeAnchor, tracks } = state;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useBackDismiss(open, close);
  const label =
    timeAnchor === "arrival"
      ? t("panel.departure.arrival")
      : t("panel.compare.frozen.departure");
  const panel = open && (
    <DeparturePanel
      initial={departure}
      count={Math.max(1, tracks.length)}
      onCancel={close}
      onApply={(value) => {
        actions.applyTrackDeparture(value);
        close();
      }}
    />
  );
  return (
    <>
      {placement === "above" && panel}
      <ContextRow
        icon={<ClockIcon />}
        label={label}
        value={`${capitalise(fmtDay(departure))} · ${fmtClock(departure)}`}
        action={open ? t("common.close") : t("panel.compare.frozen.edit")}
        chevron="down"
        open={open}
        onClick={() => setOpen((v) => !v)}
      />
      {placement === "below" && panel}
      {open && (
        <p className="px-4 pb-2.5 text-[11px] leading-relaxed" style={{ color: "var(--ow-fg-2)" }}>
          {t("panel.tracks.departure.note")}
          {" "}
          <span style={{ color: "var(--ow-fg-3)" }}>{tn("panel.tracks.departure.recompute", Math.max(1, tracks.length))}</span>
        </p>
      )}
    </>
  );
}

function DeparturePanel({
  initial,
  count,
  onCancel,
  onApply,
}: {
  initial: string;
  count: number;
  onCancel: () => void;
  onApply: (departure: string) => void;
}) {
  const { t, tn } = useT();
  const [value, setValue] = useState(initial);
  const { min, max } = useMemo(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return {
      min: toNaiveLocal(now),
      max: toNaiveLocal(new Date(now.getTime() + SWEEP_HORIZON_DAYS * 86_400_000)),
    };
  }, []);
  const valid = !Number.isNaN(new Date(value).getTime()) && value >= min && value <= max;
  return (
    <div
      className="px-4 pt-3 pb-3.5 space-y-3"
      style={{ background: "var(--ow-bg-1)", borderTop: "1px solid var(--ow-line)" }}
    >
      <div>
        <div className="text-[9px] uppercase tracking-widest font-bold mb-1.5" style={{ ...MONO, color: "var(--ow-fg-3)" }}>
          {t("panel.tracks.departure.title")}
        </div>
        <div className="flex gap-2">
          <BoundField
            label={t("panel.departure.departure")}
            value={value}
            min={min}
            max={max}
            ariaLabel={t("panel.tracks.departure.aria")}
            onChange={setValue}
          />
          <div className="flex-1" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10.5px] leading-snug" style={{ color: "var(--ow-fg-3)" }}>
          {tn("panel.tracks.departure.recompute", count)}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-xs font-semibold"
          style={{ background: "var(--ow-bg-2)", color: "var(--ow-fg-1)", border: "1px solid var(--ow-line)" }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onApply(value)}
          disabled={!valid || value === initial}
          className="rounded-lg px-4 py-2 text-xs font-bold"
          style={{
            background: valid && value !== initial ? "var(--ow-accent)" : "var(--ow-bg-2)",
            color: valid && value !== initial ? "var(--ow-on-accent)" : "var(--ow-fg-3)",
            border: `1px solid ${valid && value !== initial ? "transparent" : "var(--ow-line-2)"}`,
          }}
        >
          {t("panel.window.apply")}
        </button>
      </div>
    </div>
  );
}
