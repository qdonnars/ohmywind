// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * What the service worker precaches, and what it leaves out.
 *
 * Kept apart from `vite.config.ts` so `tests/offlineRoutes.test.ts` can read
 * it without loading the build: every page has to open offline (issue #537),
 * and that test fails as soon as a page's chunk falls under one of these
 * ignores.
 *
 * Everything the build emits under these extensions goes in, the pages loaded
 * on demand included: /methodologie, /confidentialite, /conditions,
 * /a-propos/nouveautes and /presse/communique used to stay out (about 830 KB
 * of JavaScript and CSS, plus KaTeX's fonts), on the grounds that reading
 * pages had no reason to work offline. A sailor at sea, or an app reviewer
 * who cuts the network, gets an error page there instead. KaTeX ships each
 * font in three formats; only `woff2` matches the pattern, and it is the one
 * every browser the app supports picks first.
 */
export const PRECACHE_GLOB_PATTERNS = ["**/*.{js,mjs,css,html,ico,png,svg,woff2}"];

export const PRECACHE_GLOB_IGNORES = [
  // The install sheet's screenshots: the browser fetches them itself, once,
  // before the install, and never again.
  "screenshots/**",
  // The tidal coverage map's data (/methodologie/courants): 1.6 MB of
  // GeoJSON and rasters for one map. Cached at runtime when the page is
  // first opened (see `vite.config.ts`); before that, offline, the page
  // opens with its text and an empty map.
  "methodologie/**",
  // The example polar offered for download from /config.
  "polars/**",
  // The HTML copies of the legal pages (plugins/legalPages.ts) only serve
  // crawlers without JavaScript. Once the app is installed, navigateFallback
  // serves index.html for every navigation and the page's chunk shows the
  // text.
  "confidentialite.html",
  "conditions.html",
  "terms.html",
];
