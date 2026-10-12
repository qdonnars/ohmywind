// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AggregatedLeg } from "./aggregateLegs";
import { StepStrip } from "./StepStrip";

/** Only what the strip reads: the width share, the colour and the clock. */
function step(i: number): AggregatedLeg {
  const hour = String(10 + i).padStart(2, "0");
  return {
    distance_nm: 10,
    start_time: `2026-05-08T${hour}:00:00+02:00`,
    end_time: `2026-05-08T${hour}:59:00+02:00`,
    tws_avg_kn: 8,
  } as AggregatedLeg;
}

describe("StepStrip", () => {
  it("never floors a block above an equal share of the strip (#385)", () => {
    // Ten steps at a fixed 22 px floor were 256 px of blocks before the
    // toggle: wider than a phone, and the legs table grew to fit.
    const steps = Array.from({ length: 10 }, (_, i) => step(i));
    render(<StepStrip steps={steps} selected={null} onSelect={vi.fn()} />);
    const strip = screen.getByRole("group", { name: "Pas de calcul du tronçon" });
    const blocks = within(strip).getAllByRole("button");
    expect(blocks).toHaveLength(10);
    // The share is the strip less its nine 4 px gaps, split ten ways. Read
    // loosely: jsdom rewrites the calc() into an equivalent of its own.
    for (const block of blocks) {
      expect(block.style.minWidth).toMatch(/^min\(22px, .*\(100% - 36px\)/);
    }
  });
});
