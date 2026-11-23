// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { decodePayload } from "../storage/transfer";
import { TransferPage } from "./TransferPage";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const NONCE = "0123456789abcdef0123456789abcdef";

function setUserAgent(ua: string): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("TransferPage", () => {
  it("leaves for the app at once, with the stored data", () => {
    setUserAgent(ANDROID);
    localStorage.setItem("ow_theme", "dark");
    localStorage.setItem("ow_last_simulation_v1", "{}");
    window.history.replaceState(null, "", `/transfert?n=${NONCE}`);
    const navigateTo = vi.fn();
    render(<TransferPage navigateTo={navigateTo} />);

    expect(navigateTo).toHaveBeenCalledOnce();
    const url = navigateTo.mock.calls[0][0] as string;
    // jsdom serves the page from localhost: the dev build is the target.
    expect(url).toMatch(
      new RegExp(`^intent://import\\?v=1&n=${NONCE}&d=[A-Za-z0-9_-]+#Intent;scheme=ohmywind;package=fr\\.ohmywind\\.app\\.dev;end$`),
    );
    const d = /&d=([^#]+)#/.exec(url)![1];
    expect(decodePayload(d)).toEqual({ items: { ow_theme: "dark" } });
    expect(screen.getByRole("status").textContent).toBe("Reprise de vos spots et réglages…");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers a tap when the page is still there after a moment", () => {
    setUserAgent(ANDROID);
    window.history.replaceState(null, "", `/transfert?n=${NONCE}`);
    const navigateTo = vi.fn();
    render(<TransferPage navigateTo={navigateTo} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const link = screen.getByRole("link", { name: "Terminer dans l'application" });
    expect(link.getAttribute("href")).toBe(navigateTo.mock.calls[0][0]);
    expect(navigateTo).toHaveBeenCalledOnce();
  });

  it("says there is nothing to do without a nonce", () => {
    setUserAgent(ANDROID);
    window.history.replaceState(null, "", "/transfert");
    const navigateTo = vi.fn();
    render(<TransferPage navigateTo={navigateTo} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByText(/rien à faire ici/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Retour à la carte" }).getAttribute("href")).toBe("/");
  });

  it("says there is nothing to do outside Android", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15");
    localStorage.setItem("ohmywind_custom_spots", "[]");
    window.history.replaceState(null, "", `/transfert?n=${NONCE}`);
    const navigateTo = vi.fn();
    render(<TransferPage navigateTo={navigateTo} />);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Retour à la carte" })).toBeTruthy();
  });
});
