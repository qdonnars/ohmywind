// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { loadModelConfig, saveModelConfig } from "../config/modelConfig";
import { hideSettings, showSettings } from "./settingsStore";
import { useAppliedModelOrder } from "./useAppliedModelOrder";

function Probe() {
  return <output data-testid="order">{useAppliedModelOrder().split(",").slice(0, 2).join(",")}</output>;
}

const shown = () => screen.getByTestId("order").textContent;

function moveFirstToEnd() {
  const { order } = loadModelConfig();
  act(() => saveModelConfig({ order: [...order.slice(1), order[0]] }));
}

beforeEach(() => {
  localStorage.clear();
  act(() => hideSettings());
});

describe("useAppliedModelOrder", () => {
  it("follows a new order at once while the settings are closed", () => {
    render(<Probe />);
    expect(shown()).toBe("AROME,ICON");
    moveFirstToEnd();
    expect(shown()).toBe("ICON,ECMWF");
  });

  it("holds the order while the settings are open, and moves once they close", () => {
    render(<Probe />);
    act(() => showSettings());
    moveFirstToEnd();
    moveFirstToEnd();
    expect(shown()).toBe("AROME,ICON");
    act(() => hideSettings());
    expect(shown()).toBe("ECMWF,GFS");
  });
});
