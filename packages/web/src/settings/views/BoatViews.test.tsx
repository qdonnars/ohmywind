// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettings } from "../../config/openSettings";
import {
  MIN_UPWIND_MIN,
  MOTOR_MAX_KN,
  SPI_MAX_TWS_DEFAULT,
  defaultPolarConfig,
  loadPolarConfig,
  savePolarConfig,
  type PolarConfig,
} from "../../config/polarConfig";
import { resetPolarConfigSnapshot } from "../../config/usePolarConfig";
import { ThemeProvider } from "../../design/theme";
import { SettingsSheet } from "../SettingsSheet";
import { hideSettings } from "../settingsStore";

vi.mock("../../sw", () => ({
  checkForAppUpdate: vi.fn(),
  flushPendingUpdate: vi.fn(),
}));

const dialog = () => screen.getByRole("dialog");
const inDialog = () => within(dialog());
const title = () => inDialog().getByRole("heading", { level: 2 }).textContent;
const stored = () => loadPolarConfig();

function seed(patch: Partial<PolarConfig>) {
  savePolarConfig({ ...defaultPolarConfig(), ...patch });
  resetPolarConfigSnapshot();
}

const IMPORTED = {
  name: "Otago",
  tws_kn: [6, 10, 16],
  twa_deg: [45, 90, 150],
  boat_speed_kn: [
    [3.2, 4.1, 3.0],
    [4.8, 5.9, 5.1],
    [5.6, 6.8, 6.5],
  ],
};

/** Opens the settings and walks down to the Bateau view, then `path`. */
function openBoat(...path: RegExp[]) {
  render(
    <ThemeProvider>
      <SettingsSheet />
    </ThemeProvider>,
  );
  act(() => openSettings());
  fireEvent.click(inDialog().getByRole("button", { name: /^Bateau/ }));
  for (const name of path) fireEvent.click(inDialog().getByRole("button", { name }));
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

beforeEach(() => {
  localStorage.clear();
  resetPolarConfigSnapshot();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.replaceState(null, "", "/");
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
});

afterEach(async () => {
  act(() => hideSettings());
  await settle();
  document.getElementById("root")?.remove();
  vi.unstubAllGlobals();
});

describe("Bateau", () => {
  it("lays out the boat in its groups, the resulting polar and the reset", () => {
    openBoat();
    expect(title()).toBe("Bateau");
    const groups = inDialog().getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Essentiel", "Moteur (optionnel)", "Polaire résultante"]);
    // The boat's examples come from its polar file, its name from the labels.
    const myBoat = inDialog().getByRole("button", { name: /Mon bateau/ });
    expect(myBoat.textContent).toContain("Sun Odyssey 32");
    expect(myBoat.textContent).toContain("Croiseur 30 pieds");
    expect(inDialog().getByRole("button", { name: "Tout réinitialiser" })).toBeTruthy();
  });

  it("stores the motor as typed, with the existing warnings, and re-selects the perso polar", () => {
    seed({ persoActive: false });
    openBoat();
    const threshold = inDialog().getByLabelText("Vitesse seuil (kn)");
    const speed = inDialog().getByLabelText("Vitesse moteur (kn)");

    fireEvent.change(threshold, { target: { value: "3" } });
    expect(stored().motorThresholdKn).toBe(3);
    expect(stored().persoActive).toBe(true);
    expect(inDialog().getByText(/Renseignez les deux valeurs/)).toBeTruthy();

    fireEvent.change(speed, { target: { value: "2" } });
    expect(stored().motorSpeedKn).toBe(2);
    expect(inDialog().queryByText(/Renseignez les deux valeurs/)).toBeNull();
    expect(inDialog().getByText(/La vitesse seuil dépasse la vitesse moteur/)).toBeTruthy();

    fireEvent.change(speed, { target: { value: "45" } });
    expect(stored().motorSpeedKn).toBe(MOTOR_MAX_KN);
    expect(inDialog().getByText(new RegExp(`Valeur ramenée à ${MOTOR_MAX_KN}`))).toBeTruthy();

    fireEvent.change(threshold, { target: { value: "" } });
    expect(stored().motorThresholdKn).toBeUndefined();
  });

  it("stores the coefficient from the slider", () => {
    openBoat();
    fireEvent.change(inDialog().getByLabelText(/Coefficient de performance/), { target: { value: "0.9" } });
    expect(stored().coefficient).toBe(0.9);
    expect(inDialog().getByLabelText("Coefficient de performance (90 %)")).toBeTruthy();
  });

  it("resets everything to the defaults", () => {
    seed({ base: "cruiser_40ft", coefficient: 0.6, spi: "asymmetric", motorThresholdKn: 3, motorSpeedKn: 5 });
    openBoat();
    fireEvent.click(inDialog().getByRole("button", { name: "Tout réinitialiser" }));
    expect(stored()).toEqual(defaultPolarConfig());
  });
});

describe("Mon bateau", () => {
  it("lists the nine boat types with their examples, and a pick goes back to Bateau", () => {
    seed({ overrides: { "1,2": 6.1 } });
    openBoat(/Mon bateau/);
    expect(title()).toBe("Mon bateau");
    const radios = inDialog().getAllByRole("radio");
    expect(radios).toHaveLength(9);
    expect(radios.find((r) => r.getAttribute("aria-checked") === "true")?.textContent).toContain("Croiseur 30 pieds");
    expect(radios.some((r) => r.textContent?.includes("Lagoon 40"))).toBe(true);

    fireEvent.click(radios.find((r) => r.textContent?.includes("Croiseur 40 pieds"))!);
    expect(title()).toBe("Bateau");
    // Another grid: the tuned points go.
    expect(stored().base).toBe("cruiser_40ft");
    expect(stored().overrides).toEqual({});
  });

  it("moves the focus with the arrows without choosing", () => {
    openBoat(/Mon bateau/);
    const radios = inDialog().getAllByRole("radio");
    const checked = radios.findIndex((r) => r.getAttribute("aria-checked") === "true");
    radios[checked].focus();
    fireEvent.keyDown(radios[checked], { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[checked + 1]);
    expect(title()).toBe("Mon bateau");
    expect(stored().base).toBe("cruiser_30ft");
  });

  it("is closed while an imported polar is the one planned on", () => {
    seed({ imported: IMPORTED, source: "imported" });
    openBoat();
    const myBoat = inDialog().getByRole("button", { name: /Mon bateau/ }) as HTMLButtonElement;
    expect(myBoat.disabled).toBe(true);
    expect(inDialog().getByText(/Polaire importée active : le choix du bateau/)).toBeTruthy();
  });
});

describe("Avancé", () => {
  it("steps the upwind angle from its automatic value and back to Auto", () => {
    openBoat(/^Avancé/);
    expect(title()).toBe("Avancé");
    fireEvent.click(inDialog().getByRole("button", { name: "Resserrer l'angle de près" }));
    // cruiser_30ft ships 45°: one step tighter.
    expect(stored().minUpwindDeg).toBe(44);
    fireEvent.click(inDialog().getByRole("button", { name: "Auto" }));
    expect(stored().minUpwindDeg).toBeUndefined();
  });

  it("stops the upwind angle at its floor", () => {
    seed({ minUpwindDeg: MIN_UPWIND_MIN });
    openBoat(/^Avancé/);
    const tighter = inDialog().getByRole("button", { name: "Resserrer l'angle de près" }) as HTMLButtonElement;
    expect(tighter.disabled).toBe(true);
  });

  it("sets the spinnaker and its dousing threshold", () => {
    openBoat(/^Avancé/);
    fireEvent.click(inDialog().getByRole("radio", { name: "Asymétrique" }));
    expect(stored().spi).toBe("asymmetric");
    fireEvent.click(inDialog().getByRole("button", { name: "Relever le seuil d'affalage" }));
    expect(stored().spiMaxTwsKn).toBe(SPI_MAX_TWS_DEFAULT + 1);
  });

  it("tunes a point with the keyboard, marks it, and clears the tuning", () => {
    openBoat(/^Avancé/);
    const clear = inDialog().getByRole("button", { name: "Effacer les ajustements" }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    // The 6 kn curve of cruiser_30ft: 4.4 kn at 75°.
    const point = inDialog().getByRole("button", { name: "Angle 75°, 4,4 kn" });
    fireEvent.keyDown(point, { key: "ArrowUp" });
    expect(stored().overrides).toEqual({ "0,3": 4.5 });
    expect(inDialog().getByRole("button", { name: "Angle 75°, 4,5 kn, ajusté" })).toBeTruthy();
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(stored().overrides).toEqual({});
  });

  it("imports a polar file, locks the spinnaker, and removes the file", async () => {
    seed({ spi: "symmetric" });
    openBoat(/^Avancé/);
    const file = new File(
      [["TWA\\TWS\t6\t10\t16", "45\t3.2\t4.8\t5.6", "90\t4.1\t5.9\t6.8", "150\t3.0\t5.1\t6.5"].join("\n")],
      "Otago.pol",
      { type: "text/plain" },
    );
    const input = dialog().querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 0));
    });
    const cfg = stored();
    expect(cfg.source).toBe("imported");
    expect(cfg.imported?.name).toBe("Otago");
    expect(cfg.spi).toBe("off");
    expect(inDialog().getByText(/« Otago » importée/)).toBeTruthy();
    // Locked spinnaker, no hand tuning on an imported polar.
    expect((inDialog().getByRole("radio", { name: "Aucun" }) as HTMLButtonElement).disabled).toBe(true);
    expect(inDialog().queryByRole("button", { name: "Effacer les ajustements" })).toBeNull();

    fireEvent.click(inDialog().getByRole("radio", { name: "Archétype ajusté" }));
    expect(stored().source).toBe("archetype");
    fireEvent.click(inDialog().getByRole("button", { name: "Supprimer" }));
    expect(stored().imported).toBeNull();
  });

  it("re-selects the perso polar on any change", () => {
    seed({ persoActive: false });
    openBoat(/^Avancé/);
    fireEvent.click(inDialog().getByRole("radio", { name: "Symétrique" }));
    expect(stored().persoActive).toBe(true);
  });
});
