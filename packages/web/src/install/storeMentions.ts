// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { STORE_HOSTS } from "./stores";

/**
 * Keeping the store apps free of any mention of a platform or a store.
 *
 * Apple refuses an iOS app that names Android or Google Play, and the apps
 * carry no invitation or mention of that kind either way. Most texts say the
 * same thing in neutral words on the site and in the apps. What stays here is
 * the Markdown whose platform lines are worth having on the site: the press
 * release's download links, the release notes about the Android app. Inside a
 * store app those lines are dropped, whole list items at a time.
 */

const PLATFORM_WORDS = /\b(android|google play|play store|app store|iphone|ipad|ipados|ios)\b/i;

export function mentionsPlatform(text: string): boolean {
  if (PLATFORM_WORDS.test(text)) return true;
  return STORE_HOSTS.some((host) => text.includes(host));
}

const ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const HEADING = /^(#{1,6})\s/;

/**
 * `md` without the list items that mention a platform, and without the
 * headings those removals leave with nothing under them. An item goes with
 * its continuation lines (indented deeper than its marker, up to the next
 * item or blank line), so a wrapped item never leaves half a sentence.
 */
export function withoutPlatformItems(md: string): string {
  const lines = md.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const item = ITEM.exec(lines[i]);
    if (!item) {
      kept.push(lines[i]);
      i += 1;
      continue;
    }
    const indent = item[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (next.trim() === "" || ITEM.test(next) || HEADING.test(next)) break;
      if (next.length - next.trimStart().length <= indent) break;
      end += 1;
    }
    const block = lines.slice(i, end);
    if (!mentionsPlatform(block.join(" "))) kept.push(...block);
    i = end;
  }
  const out = dropEmptySections(kept).join("\n").replace(/\n{3,}/g, "\n\n");
  // The text ends the way it did: a section dropped at the end leaves no
  // blank line behind.
  return out.replace(/\n*$/, /\n*$/.exec(md)![0]);
}

/** Headings followed by nothing but blank lines before the next heading of
    the same or a higher level (or the end). */
function dropEmptySections(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = HEADING.exec(lines[i]);
    if (heading) {
      const level = heading[1].length;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j += 1;
      const next = j < lines.length ? HEADING.exec(lines[j]) : null;
      if (j >= lines.length || (next && next[1].length <= level)) continue;
    }
    out.push(lines[i]);
  }
  return out;
}
