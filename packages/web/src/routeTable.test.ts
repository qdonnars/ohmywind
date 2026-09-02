// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { matchRoute } from "./routeTable";

describe("matchRoute", () => {
  it("resolves every page the app publishes", () => {
    expect(matchRoute("/")).toBe("explore");
    expect(matchRoute("/plan")).toBe("plan");
    expect(matchRoute("/config")).toBe("config");
    expect(matchRoute("/methodologie")).toBe("methodologie");
    expect(matchRoute("/confidentialite")).toBe("confidentialite");
  });

  it("answers not-found for an unknown path", () => {
    // Was the explore map, under an address that does not exist.
    expect(matchRoute("/plans")).toBe("not-found");
    expect(matchRoute("/PLAN")).toBe("not-found");
    expect(matchRoute("/plan/leg/2")).toBe("not-found");
    expect(matchRoute("/wp-admin")).toBe("not-found");
  });

  it("does not answer from the prototype chain", () => {
    // A path is untrusted input. With an object literal these would still be
    // safe thanks to the leading slash; the Map makes it true without the
    // reasoning.
    expect(matchRoute("/constructor")).toBe("not-found");
    expect(matchRoute("constructor")).toBe("not-found");
    expect(matchRoute("__proto__")).toBe("not-found");
  });
});
