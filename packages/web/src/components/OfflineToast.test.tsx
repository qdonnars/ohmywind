// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OfflineToast } from "./OfflineToast";
import {
  OFFLINE_NOTICE_MS,
  dismissOfflineNotice,
  noteIfOffline,
  notifyOffline,
} from "../offline/offlineNotice";

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => dismissOfflineNotice());
  vi.useRealTimers();
  setOnLine(true);
});

describe("OfflineToast", () => {
  it("says nothing while nothing was asked, even offline", () => {
    setOnLine(false);
    render(<OfflineToast floating />);
    // The live region is there, empty, so a later message is heard.
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("shows the short sentence when a request found no network, then goes by itself", () => {
    setOnLine(false);
    render(<OfflineToast floating />);
    act(() => {
      expect(noteIfOffline()).toBe(true);
    });
    expect(screen.getByRole("status").textContent).toBe("Hors ligne : mise à jour impossible");
    act(() => vi.advanceTimersByTime(OFFLINE_NOTICE_MS));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("is extended by a second request rather than stacked", () => {
    setOnLine(false);
    render(<OfflineToast floating />);
    act(() => notifyOffline());
    act(() => vi.advanceTimersByTime(OFFLINE_NOTICE_MS - 1000));
    act(() => notifyOffline());
    expect(screen.getAllByText("Hors ligne : mise à jour impossible")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(OFFLINE_NOTICE_MS - 1000));
    expect(screen.getByRole("status").textContent).not.toBe("");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("goes as soon as the network is back", () => {
    setOnLine(false);
    render(<OfflineToast />);
    act(() => notifyOffline());
    expect(screen.getByRole("status").textContent).not.toBe("");
    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("stays silent for a failure with the network present: that one keeps its own message", () => {
    setOnLine(true);
    render(<OfflineToast floating />);
    act(() => {
      expect(noteIfOffline()).toBe(false);
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("writes no colour by hand, and not the warning ones", () => {
    setOnLine(false);
    render(<OfflineToast floating />);
    act(() => notifyOffline());
    const toast = screen.getByText("Hors ligne : mise à jour impossible");
    const style = toast.getAttribute("style") ?? "";
    expect(style).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(style).not.toContain("--ow-warn");
    expect(style).toContain("--ow-surface-pop");
  });
});
