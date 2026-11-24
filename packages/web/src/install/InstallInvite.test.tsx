// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InstallInvite } from "./InstallInvite";
import { INVITE_FIRST_DELAY_MS, INVITE_QUIET_MS } from "./invite";
import { STORE_URLS } from "./stores";
import { LOCAL_STORAGE_KEYS } from "../storage/keys";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
const KEY = LOCAL_STORAGE_KEYS.installInvite;

function setUserAgent(ua: string): void {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
}

function setStandalone(standalone: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Past the first delay and one poll: the earliest the sheet can show. */
function waitForInvite(): void {
  act(() => {
    vi.advanceTimersByTime(INVITE_FIRST_DELAY_MS + 1_000);
  });
}

const sheet = () => screen.queryByRole("dialog");

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  setStandalone(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe("InstallInvite", () => {
  it("invites an Android browser to Google Play, after the first delay only", () => {
    setUserAgent(ANDROID);
    render(<InstallInvite />);
    act(() => {
      vi.advanceTimersByTime(INVITE_FIRST_DELAY_MS - 1_000);
    });
    expect(sheet()).toBeNull();
    waitForInvite();
    expect(sheet()).not.toBeNull();
    const link = screen.getByRole("link", { name: "Ouvrir Google Play" });
    expect(link.getAttribute("href")).toBe(STORE_URLS.android);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(document.activeElement).toBe(sheet());
  });

  it("waits for the reader to stop touching the screen", () => {
    setUserAgent(ANDROID);
    render(<InstallInvite />);
    act(() => {
      vi.advanceTimersByTime(INVITE_FIRST_DELAY_MS - 500);
    });
    fireEvent.pointerDown(document.body);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(sheet()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(INVITE_QUIET_MS);
    });
    expect(sheet()).not.toBeNull();
  });

  it("« Plus tard » closes it and remembers the answer", () => {
    setUserAgent(ANDROID);
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
    render(<InstallInvite />);
    waitForInvite();
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(sheet()).toBeNull();
    expect(localStorage.getItem(KEY)).toBe(String(Date.now()));
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(sheet()).toBeNull();
  });

  it("Escape closes it too, and the store button counts as an answer", () => {
    setUserAgent(ANDROID);
    render(<InstallInvite />);
    waitForInvite();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet()).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    localStorage.clear();
    render(<InstallInvite />);
    waitForInvite();
    fireEvent.click(screen.getByRole("link", { name: "Ouvrir Google Play" }));
    expect(sheet()).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("stays away after a recent answer", () => {
    setUserAgent(ANDROID);
    localStorage.setItem(KEY, String(Date.now() - 24 * 60 * 60 * 1000));
    render(<InstallInvite />);
    waitForInvite();
    expect(sheet()).toBeNull();
  });

  it.each([
    ["on an iPhone, while the App Store link is empty", IPHONE],
    ["on a computer", DESKTOP],
  ])("never shows %s", (_where, ua) => {
    setUserAgent(ua);
    render(<InstallInvite />);
    waitForInvite();
    expect(sheet()).toBeNull();
  });

  it("never shows in an installed PWA", () => {
    setUserAgent(ANDROID);
    setStandalone(true);
    render(<InstallInvite />);
    waitForInvite();
    expect(sheet()).toBeNull();
  });

  it("never shows in the native shell", () => {
    setUserAgent(ANDROID);
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    render(<InstallInvite />);
    waitForInvite();
    expect(sheet()).toBeNull();
  });

  it("never shows in the TWA, even after a reload has lost its referrer", () => {
    setUserAgent(ANDROID);
    sessionStorage.setItem("ow_store_app", "1");
    render(<InstallInvite />);
    waitForInvite();
    expect(sheet()).toBeNull();
  });

  it("does not cover another dialog", () => {
    setUserAgent(ANDROID);
    render(
      <>
        <div role="dialog" aria-label="Planifier une route ?" />
        <InstallInvite />
      </>,
    );
    waitForInvite();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
