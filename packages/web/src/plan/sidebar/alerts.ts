// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

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
