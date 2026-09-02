// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setOnLine(true);
});

describe("OfflineBanner", () => {
  it("ne montre rien tant que le navigateur a du reseau", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("apparait a la coupure et disparait au retour", () => {
    render(<OfflineBanner />);

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Hors connexion");
    expect(banner.textContent).toContain("prévisions");

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("n'ecrit aucune couleur en dur", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    // Les couleurs viennent des jetons : un hex ici casserait le theme clair.
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("style")).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(banner.getAttribute("style")).toContain("--ow-warn");
  });
});
