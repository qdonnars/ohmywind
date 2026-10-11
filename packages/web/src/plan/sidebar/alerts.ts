// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { complexityNotice, noticeText, passageNotices } from "../notices";
import type { ComplexityScore, ComplexityWarning, Notice, PassageReport } from "../types";

export type AlertKind = "wind" | "sea" | "current" | "other";

export interface Alert {
  message: string;
  kind: AlertKind;
}

/** The server's complexity warnings carry their kind; its passage warnings
    are sentences, sorted here by what they name. French and English, the
    two languages the backend has spoken. */
export function classifyAlert(message: string): AlertKind {
  if (/courant|current/i.test(message)) return "current";
  if (/\bvent|wind|tws|rafale|gust/i.test(message)) return "wind";
  if (/\bmer\b|houle|\bhs\b|vague|\bsea\b|swell|wave/i.test(message)) return "sea";
  return "other";
}

/** What a coded passage warning is about; the sentence decides otherwise. */
const KIND_BY_CODE: Record<string, AlertKind> = {
  "passage.light_wind": "wind",
  "passage.long_route": "other",
  "passage.model_fallback": "other",
  "currents.tidal_gap": "current",
};

function kindOfNotice(n: Notice): AlertKind {
  return KIND_BY_CODE[n.code] ?? classifyAlert(n.message);
}

/** Chop is a state of the sea: the summary line has four words, not five. */
function kindOfComplexity(w: ComplexityWarning): AlertKind {
  return w.kind === "chop" ? "sea" : w.kind;
}

/** Every alert of a computed passage, in the reader's language: the score's
    warnings first, then the engine's. */
export function alertsOf(passage: PassageReport, complexity: ComplexityScore): Alert[] {
  return [
    ...(complexity.warnings ?? []).map((w) => ({
      message: noticeText(complexityNotice(w)),
      kind: kindOfComplexity(w),
    })),
    ...passageNotices(passage).map((n) => ({ message: noticeText(n), kind: kindOfNotice(n) })),
  ];
}
