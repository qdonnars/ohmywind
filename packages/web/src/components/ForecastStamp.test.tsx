// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastStamp } from "./ForecastStamp";
import { FORECAST_STALE_WARNING_HOURS } from "../offline/freshness";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-17T08:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("ForecastStamp", () => {
  it("dates a forecast read from the device, offline", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    // Tuesday 17 at 07:00 UTC, read on the machine's own clock.
    render(<ForecastStamp fetchedAt={NOW.getTime() - HOUR} />);
    expect(screen.getByText(/^Prévisions du mar\. 17 nov\. à \d\d:00$/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it(`warns past ${FORECAST_STALE_WARNING_HOURS} h, quoting the threshold`, () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    render(<ForecastStamp fetchedAt={NOW.getTime() - (FORECAST_STALE_WARNING_HOURS + 1) * HOUR} />);
    expect(screen.getByRole("note").textContent).toContain(`plus de ${FORECAST_STALE_WARNING_HOURS} h`);
  });
});
