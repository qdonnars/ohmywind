// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { describe, expect, it } from "vitest";
import changelogFr from "../../../../CHANGELOG.md?raw";
import changelogEn from "../../../../CHANGELOG.en.md?raw";
import { APP_VERSION, compareVersions } from "../utils/version";
import { linkPullRequests, parseChangelog, visibleReleases, type Release } from "./changelog";

const FILES: Array<[string, string, readonly string[]]> = [
  ["CHANGELOG.md", changelogFr, ["Nouveautés", "Corrections", "Coulisses"]],
  ["CHANGELOG.en.md", changelogEn, ["New", "Fixes", "Behind the scenes"]],
];

describe.each(FILES)("%s", (_name, md, headings) => {
  const releases = parseChangelog(md);
  const released = releases.filter((r) => r.date !== null);

  it("parses, and every section has a version, a date or the upcoming label, a title and a body", () => {
    expect(released.length).toBeGreaterThan(0);
    for (const r of releases) {
      expect(r.version, r.title).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.title.length, r.version).toBeGreaterThan(0);
      expect(r.body.length, r.version).toBeGreaterThan(0);
      if (r.date !== null) expect(r.date, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps the upcoming release, if any, alone and on top", () => {
    const upcoming = releases.filter((r) => r.date === null);
    expect(upcoming.length).toBeLessThanOrEqual(1);
    if (upcoming.length === 1) {
      expect(releases[0]).toBe(upcoming[0]);
      expect(compareVersions(upcoming[0].version, released[0].version)).toBeGreaterThan(0);
    }
  });

  it("lists released versions newest first, one per production day", () => {
    for (let i = 1; i < released.length; i++) {
      const [newer, older] = [released[i - 1], released[i]];
      expect(compareVersions(newer.version, older.version), `${newer.version} > ${older.version}`).toBeGreaterThan(0);
      expect(newer.date! > older.date!, `${newer.date} > ${older.date}`).toBe(true);
    }
  });

  it("files every entry under the three headings, and only those", () => {
    for (const r of releases) {
      const found = [...r.body.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
      expect(found.length, r.version).toBeGreaterThan(0);
      for (const h of found) expect(headings, `${r.version} : ${h}`).toContain(h);
    }
  });

  it("carries no em dash", () => {
    expect(md).not.toContain("—");
  });
});

describe("the version shipped", () => {
  it("is the newest released section of the changelog", () => {
    // package.json "version", injected at build time. A promotion bumps it
    // and dates the upcoming section in the same commit (docs/releases.md).
    const newest = parseChangelog(changelogFr).find((r) => r.date !== null);
    expect(newest?.version).toBe(APP_VERSION);
  });

  it("is described the same way in both languages", () => {
    const outline = (md: string) => parseChangelog(md).map((r) => `${r.version} ${r.date ?? "upcoming"}`);
    expect(outline(changelogEn)).toEqual(outline(changelogFr));
  });
});

describe("parseChangelog", () => {
  it("ignores the preamble and keeps each body to its section", () => {
    const md = [
      "# Quoi de neuf",
      "",
      "Préambule.",
      "",
      "## 2.0.0 · Prochaine version · Bientôt",
      "",
      "### Nouveautés",
      "",
      "- A (#12).",
      "",
      "## 1.0.0 · 2026-08-01 · Première",
      "",
      "### Corrections",
      "",
      "- B.",
    ].join("\n");
    expect(parseChangelog(md)).toEqual<Release[]>([
      { version: "2.0.0", date: null, title: "Bientôt", body: "### Nouveautés\n\n- A (#12)." },
      { version: "1.0.0", date: "2026-08-01", title: "Première", body: "### Corrections\n\n- B." },
    ]);
  });

  it("refuses a heading it cannot read", () => {
    expect(() => parseChangelog("## 1.0 - 2026-08-01 - Mal formé")).toThrow(/illisible/);
  });
});

describe("linkPullRequests", () => {
  it("links every pull request number and leaves headings alone", () => {
    expect(linkPullRequests("### Nouveautés\n\n- Texte (#426, #428).")).toBe(
      "### Nouveautés\n\n- Texte ([#426](https://github.com/qdonnars/ohmywind/pull/426), " +
        "[#428](https://github.com/qdonnars/ohmywind/pull/428)).",
    );
  });

  it("does not touch a hash inside a word", () => {
    expect(linkPullRequests("C# et a#12")).toBe("C# et a#12");
  });
});

describe("visibleReleases", () => {
  const releases: Release[] = [
    { version: "1.9.0", date: null, title: "À venir", body: "x" },
    { version: "1.8.0", date: "2026-10-11", title: "Courants", body: "x" },
  ];

  it("hides the upcoming release on the production site", () => {
    expect(visibleReleases(releases, "ohmywind.fr").map((r) => r.version)).toEqual(["1.8.0"]);
    expect(visibleReleases(releases, "www.ohmywind.fr").map((r) => r.version)).toEqual(["1.8.0"]);
  });

  it("shows it on the preview and in development", () => {
    expect(visibleReleases(releases, "dev.ohmywind.fr")).toHaveLength(2);
    expect(visibleReleases(releases, "localhost")).toHaveLength(2);
  });
});
