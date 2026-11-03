// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDocumentTitle } from "./useDocumentTitle";

describe("useDocumentTitle", () => {
  it("shows the page's title, then gives the shell's back", () => {
    document.title = "Terms of use · OhMyWind";
    const { unmount } = renderHook(() => useDocumentTitle("Confidentialité · OhMyWind"));
    expect(document.title).toBe("Confidentialité · OhMyWind");
    unmount();
    expect(document.title).toBe("OhMyWind");
  });
});
