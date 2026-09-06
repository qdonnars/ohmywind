// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { createElement, Fragment, type ReactNode } from "react";

export type RichTags = Record<string, (chunk: ReactNode) => ReactNode>;

const TAG = /<(\w+)>(.*?)<\/\1>/gs;

/**
 * A sentence with an element inside it, without splitting the sentence
 * across three keys. "Voir la <a>méthodologie</a>." with
 * `{ a: (c) => <a href="/methodologie">{c}</a> }` renders the link in place.
 *
 * One level only, no nesting, and a tag with no renderer falls back to its
 * bare text, so a stray tag never hides a word.
 */
export function rich(text: string, tags: RichTags): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TAG)) {
    const [whole, name, inner] = m;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const render = tags[name];
    out.push(createElement(Fragment, { key: i++ }, render ? render(inner) : inner));
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 ? out[0] : out;
}
