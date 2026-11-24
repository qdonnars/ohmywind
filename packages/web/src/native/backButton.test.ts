// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import { backButtonAction } from "./backButton";

describe("backButtonAction", () => {
  it("goes back through the history the shell reports", () => {
    // A panel, a menu, an expanded leg, a page reached by a tap.
    expect(backButtonAction({ canGoBack: true, onResumedPlan: false, historyLength: 3 })).toBe("back");
    expect(backButtonAction({ canGoBack: true, onResumedPlan: true, historyLength: 3 })).toBe("back");
  });

  it("takes the resumed plan back to the explorer the shell does not report", () => {
    expect(backButtonAction({ canGoBack: false, onResumedPlan: true, historyLength: 2 })).toBe("back");
  });

  it("leaves the app from the first page", () => {
    // The explorer, after back from the resumed plan.
    expect(backButtonAction({ canGoBack: false, onResumedPlan: false, historyLength: 2 })).toBe("minimize");
    expect(backButtonAction({ canGoBack: false, onResumedPlan: false, historyLength: 1 })).toBe("minimize");
  });

  it("leaves the app from a shortcut or a link opened cold", () => {
    // The system opened the page: the resume is forgotten.
    expect(backButtonAction({ canGoBack: false, onResumedPlan: false, historyLength: 2 })).toBe("minimize");
  });

  it("never goes back without history", () => {
    expect(backButtonAction({ canGoBack: false, onResumedPlan: true, historyLength: 1 })).toBe("minimize");
  });
});
