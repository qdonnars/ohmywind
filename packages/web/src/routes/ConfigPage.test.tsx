// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LangPicker } from "./ConfigPage";
import { AVAILABLE_LANGS, LANG_NAMES, LANG_SHORT_NAMES } from "../i18n";

/**
 * The picker keeps its five pills on one line at every width, so both labels
 * ship in the markup and CSS decides which one shows. jsdom applies no
 * stylesheet, hence no assertion here on which of the two is visible: what
 * these tests pin is that shortening the label never shortens what a screen
 * reader announces.
 */
describe("LangPicker", () => {
  it("names every pill with the full endonym, never the trigram", () => {
    render(<LangPicker />);
    for (const l of AVAILABLE_LANGS) {
      expect(screen.getByRole("radio", { name: LANG_NAMES[l] })).toBeDefined();
      expect(screen.queryByRole("radio", { name: LANG_SHORT_NAMES[l] })).toBeNull();
    }
  });

  it("renders both labels, full name and trigram, for every language", () => {
    render(<LangPicker />);
    for (const l of AVAILABLE_LANGS) {
      expect(screen.getByText(LANG_NAMES[l])).toBeDefined();
      expect(screen.getByText(LANG_SHORT_NAMES[l])).toBeDefined();
    }
  });

  it("keeps the radiogroup and marks the active language", () => {
    render(<LangPicker />);
    const group = screen.getByRole("radiogroup", { name: "Langue" });
    expect(group).toBeDefined();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(AVAILABLE_LANGS.length);
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0].getAttribute("aria-label")).toBe(LANG_NAMES["fr"]);
  });
});
