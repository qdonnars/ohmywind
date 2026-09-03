// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MetricView } from "../types";
import { ArrowConventionNote } from "./ArrowConventionNote";

afterEach(cleanup);

const METRICS: MetricView[] = ["wind", "waves", "tides", "currents"];

function noteFor(metric: MetricView): string {
  const { container } = render(<ArrowConventionNote metric={metric} />);
  return container.querySelector("p")?.textContent ?? "";
}

describe("ArrowConventionNote", () => {
  it.each(METRICS)("dit quelque chose pour l'onglet %s", (metric) => {
    expect(noteFor(metric).length).toBeGreaterThan(20);
  });

  it("donne au vent et a la houle la meme lecture", () => {
    // WindCell et la cellule wave_dir tournent le meme glyphe de dir + 180 :
    // la fleche pointe la ou ca va, le chiffre dit d'ou ca vient.
    for (const metric of ["wind", "waves"] as const) {
      const text = noteFor(metric);
      expect(text).toMatch(/suivent le déplacement/);
      expect(text).toMatch(/d'où (il|elle) vient/);
      cleanup();
    }
  });

  it("garde au courant sa convention inverse", () => {
    expect(noteFor("currents")).toMatch(/vers laquelle le courant porte/);
  });

  it("ne parle pas de fleche pour la maree, qui n'en a pas", () => {
    expect(noteFor("tides")).not.toMatch(/flèche/i);
  });
});
