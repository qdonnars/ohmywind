// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, it, expect } from "vitest";
import { parseStoredDepths } from "./useWaypointDepths";

describe("parseStoredDepths", () => {
  it("reads a cell-to-depth map", () => {
    expect(parseStoredDepths('{"48.390,-4.486":37.5,"48.400,-4.500":12}')).toEqual({
      "48.390,-4.486": 37.5,
      "48.400,-4.500": 12,
    });
  });

  it("keeps null apart from a depth", () => {
    // null is "there is no sounding here", which is an answer worth
    // remembering: re-asking EMODnet would cost a request for the same null.
    expect(parseStoredDepths('{"48.390,-4.486":null}')).toEqual({ "48.390,-4.486": null });
  });

  it("reads an empty map", () => {
    expect(parseStoredDepths("{}")).toEqual({});
  });

  it("discards anything that is not such a map", () => {
    expect(parseStoredDepths("{oops")).toBeNull();
    expect(parseStoredDepths("null")).toBeNull();
    expect(parseStoredDepths("[1,2]")).toBeNull();
    expect(parseStoredDepths('"48.390,-4.486"')).toBeNull();
    expect(parseStoredDepths('{"48.390,-4.486":"37.5"}')).toBeNull();
    expect(parseStoredDepths('{"48.390,-4.486":true}')).toBeNull();
  });

  it("discards a map holding a non-finite depth", () => {
    // JSON has no NaN, but a hand-edited or truncated payload can produce one
    // through a string that parses to a number-shaped nothing.
    expect(parseStoredDepths('{"48.390,-4.486":1e999}')).toBeNull();
  });
});
