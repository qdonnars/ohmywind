// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { rich } from "./rich";

describe("rich", () => {
  it("rend une balise en élément et garde le texte autour", () => {
    const node = rich("Voir la <a>méthodologie</a> avant de partir.", {
      a: (c) => createElement("a", { href: "/methodologie" }, c),
    });
    const { container } = render(createElement("p", null, node));
    expect(container.textContent).toBe("Voir la méthodologie avant de partir.");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/methodologie");
  });

  it("laisse une balise sans rendu en texte nu", () => {
    const { container } = render(createElement("p", null, rich("un <b>mot</b>", {})));
    expect(container.textContent).toBe("un mot");
    expect(container.querySelector("b")).toBeNull();
  });

  it("rend un texte sans balise tel quel", () => {
    expect(rich("rien", {})).toBe("rien");
  });
});
