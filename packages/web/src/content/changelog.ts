// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * The release log, read from CHANGELOG.md (French, the reference) and
 * CHANGELOG.en.md at the root of the repository. Those two files are the only
 * source: the /nouveautes page renders them, the GitHub releases copy their
 * sections, and docs/releases.md says how a section is cut.
 *
 * A section opens on a level-2 heading, three fields separated by a middle
 * dot:
 *
 *     ## 1.8.0 · 2026-10-11 · Courants de marée : la bonne source
 *
 * version, production date (ISO), one-line title. The upcoming release, at
 * most one and always on top, carries a label instead of the date
 * ("Prochaine version", "Next release"). Everything above the first section
 * is the file's own preamble, for readers of the repository.
 */

export interface Release {
  /** "1.8.0" */
  version: string;
  /** Production day, "2026-10-11"; null for the release not shipped yet. */
  date: string | null;
  title: string;
  /** Markdown under the heading: the Nouveautés, Corrections and Coulisses lists. */
  body: string;
}

const HEADING = /^## (\d+\.\d+\.\d+) · (.+?) · (.+)$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Throws on a section heading it cannot read, so a typo fails the tests. */
export function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  let body: string[] = [];

  const flush = () => {
    if (current) releases.push({ ...current, body: body.join("\n").trim() });
  };

  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      flush();
      const m = HEADING.exec(line.trimEnd());
      if (!m) throw new Error(`Titre de version illisible : « ${line} »`);
      const [, version, when, title] = m;
      current = { version, date: ISO_DAY.test(when) ? when : null, title: title.trim(), body: "" };
      body = [];
    } else if (current) {
      body.push(line);
    }
  }
  flush();
  return releases;
}

const REPO = "https://github.com/qdonnars/ohmywind";

/**
 * "(#459)" and "#426, #428" become links to the pull requests. GitHub links
 * them by itself in a release note, not in the app. A heading ("### ") is
 * left alone: the pattern wants digits right after the hash.
 */
export function linkPullRequests(md: string): string {
  return md.replace(/(^|[\s(,])#(\d+)\b/g, (_, before: string, n: string) => `${before}[#${n}](${REPO}/pull/${n})`);
}

/** The production site, where a release not shipped yet has no business showing. */
const PRODUCTION_HOSTS = new Set(["ohmywind.fr", "www.ohmywind.fr"]);

/**
 * The releases a reader on `hostname` sees. The upcoming section shows
 * everywhere but production: on dev.ohmywind.fr it is what the preview is
 * testing, on ohmywind.fr it would announce what is not there.
 */
export function visibleReleases(releases: readonly Release[], hostname: string): Release[] {
  return PRODUCTION_HOSTS.has(hostname) ? releases.filter((r) => r.date !== null) : [...releases];
}
