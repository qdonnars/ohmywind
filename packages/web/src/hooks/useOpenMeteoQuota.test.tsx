// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useOpenMeteoQuota } from "./useOpenMeteoQuota";
import {
  clearOpenMeteoQuota,
  noteOpenMeteoRefusal,
  openMeteoQuotaMessage,
} from "../api/openMeteoQuota";

const DAILY = { error: true, reason: "Daily API request limit exceeded. Please try again tomorrow." };

/** What the explore table and the compare page render in their empty state. */
function Probe() {
  const quota = useOpenMeteoQuota();
  return (
    <p role="status">
      {quota ? openMeteoQuotaMessage("connection", quota.window, quota.resetAt) : "rien"}
    </p>
  );
}

describe("useOpenMeteoQuota", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T21:30:00Z"));
    clearOpenMeteoQuota();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the refusal the fetcher recorded, with the wait, then lets it go on the clock", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("rien");

    act(() => {
      noteOpenMeteoRefusal(DAILY);
    });
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("par jour pour votre connexion");
    expect(text).toContain("3 heures environ");

    // The countdown moves without a new refusal: 23:30 UTC is half an hour
    // plus the sweep away from the reset, said as 31 minutes.
    act(() => {
      vi.setSystemTime(new Date("2026-09-13T23:30:00Z"));
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("status").textContent).toContain("31 minutes");

    // Past the reset, the next tick finds no exhaustion at all.
    act(() => {
      vi.setSystemTime(new Date("2026-09-14T00:01:30Z"));
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("status").textContent).toBe("rien");
  });
});
