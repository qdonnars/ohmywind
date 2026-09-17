// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The server's warnings, said in the reader's language.
 *
 * The passage engine speaks French: every warning it raises is a sentence,
 * and until #411 the app showed that sentence whatever the language chosen.
 * The server now sends each one with a code and the values that filled it,
 * and the sentence is composed here from the `plan.notice.*` entries of the
 * dictionaries. The French sentence stays the fallback: for a code this
 * build does not know, and for the caches and servers that predate codes.
 */

import { hasKey, t } from "../i18n";
import type { ComplexityWarning, Notice, PassageReport } from "./types";

/** A sentence with no code behind it: an older server's, or a cached one. */
export function noticeFromMessage(message: string): Notice {
  return { code: "", params: {}, message };
}

/** The complexity warning's notice; the sentence alone from an older server. */
export function complexityNotice(w: ComplexityWarning): Notice {
  return { code: w.code ?? "", params: w.params ?? {}, message: w.message };
}

/**
 * The passage's warnings as notices: the coded ones when the server sent
 * them, else its sentences. The two lists are one for one, so a length that
 * differs means a body assembled from two servers, and the sentences win.
 */
export function passageNotices(p: PassageReport): Notice[] {
  if (p.notices && p.notices.length === p.warnings.length) return p.notices;
  return p.warnings.map(noticeFromMessage);
}

/** The notice in the active language, or the server's own sentence. */
export function noticeText(n: Notice): string {
  const key = `plan.notice.${n.code}`;
  return n.code !== "" && hasKey(key) ? t(key, n.params) : n.message;
}
