// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { BoatAdvanced } from "./BoatAdvanced";
import { defaultPolarConfig, type PolarConfig } from "../config/polarConfig";

function Harness({ onChange }: { onChange: (next: PolarConfig) => void }) {
  const [cfg, setCfg] = useState<PolarConfig>(() => defaultPolarConfig());
  return (
    <BoatAdvanced
      config={cfg}
      onChange={(next) => {
        onChange(next);
        setCfg(next);
      }}
    />
  );
}

function lastConfig(spy: ReturnType<typeof vi.fn>): PolarConfig | undefined {
  return spy.mock.calls.at(-1)?.[0] as PolarConfig | undefined;
}

describe("BoatAdvanced, angle de près minimal", () => {
  it("garde 50 quand on tape 50 (forum : 50 devenait 70)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByPlaceholderText(/^auto/) as HTMLInputElement;
    await user.type(input, "50");
    expect(input.value).toBe("50");
    expect(lastConfig(onChange)?.minUpwindDeg).toBe(50);
    await user.tab();
    expect(input.value).toBe("50");
    expect(lastConfig(onChange)?.minUpwindDeg).toBe(50);
  });

  it("n'applique le plancher qu'en quittant le champ", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByPlaceholderText(/^auto/) as HTMLInputElement;
    await user.type(input, "5");
    expect(input.value).toBe("5");
    expect(lastConfig(onChange)?.minUpwindDeg).toBeUndefined();
    await user.tab();
    expect(input.value).toBe("25");
    expect(lastConfig(onChange)?.minUpwindDeg).toBe(25);
  });
});
