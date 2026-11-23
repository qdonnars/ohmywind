// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { inAppPath } from "./appLinks";

const ORIGIN = "https://ohmywind.fr";

describe("inAppPath", () => {
  it("turns a shortcut URL into its path", () => {
    expect(inAppPath("https://ohmywind.fr/plan", ORIGIN)).toBe("/plan");
    expect(inAppPath("https://ohmywind.fr/config", ORIGIN)).toBe("/config");
  });

  it("keeps the query and the fragment of a shared plan", () => {
    expect(inAppPath("https://ohmywind.fr/plan?wpts=43.2,5.3;43,6.2#leg-2", ORIGIN)).toBe(
      "/plan?wpts=43.2,5.3;43,6.2#leg-2",
    );
  });

  it("ignores the bridge's own scheme", () => {
    expect(inAppPath("ohmywind://import?v=1&n=abc&d=e30", ORIGIN)).toBeNull();
  });

  it("ignores another host, another scheme or another port", () => {
    expect(inAppPath("https://dev.ohmywind.fr/plan", ORIGIN)).toBeNull();
    expect(inAppPath("http://ohmywind.fr/plan", ORIGIN)).toBeNull();
    expect(inAppPath("https://ohmywind.fr:8443/plan", ORIGIN)).toBeNull();
    expect(inAppPath("https://ohmywind.fr.example.com/plan", ORIGIN)).toBeNull();
  });

  it("ignores what is not a URL", () => {
    expect(inAppPath("/plan", ORIGIN)).toBeNull();
    expect(inAppPath("", ORIGIN)).toBeNull();
  });
});
