// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

// Machinery behind LazyPageBoundary, kept out of the component file so that
// one only exports a component (react-refresh/only-export-components).

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

/** A dynamic import of a page module, as passed to React.lazy. */
export type PageLoader = () => Promise<{ default: ComponentType }>;

// One lazy payload per loader for the life of the tab, so navigating away from
// a documentation page and back does not flash the loading fallback: React
// keeps the resolved module on the payload.
//
// There is deliberately no way to reset an entry. A failed dynamic import
// cannot be retried inside the same document: the HTML module map records the
// failure against the URL, and every later import of that specifier in the
// same realm reuses it without touching the network. Verified on the
// production build, offline then back online: fetch() of the chunk answers
// 200 while import() of the same URL keeps throwing. React compounds this by
// caching the rejected lazy payload and rethrowing it. Recovery is therefore a
// document reload, which is what the boundary offers.
const lazyByLoader = new Map<PageLoader, LazyExoticComponent<ComponentType>>();

export function lazyFor(load: PageLoader): LazyExoticComponent<ComponentType> {
  const cached = lazyByLoader.get(load);
  if (cached) return cached;
  const created = lazy(load);
  lazyByLoader.set(load, created);
  return created;
}

// Browsers word a failed dynamic import differently, and none of them use a
// dedicated error type. Matching on the wording is unpleasant but it is what
// separates "the chunk never arrived" from "the page itself threw", and the
// two deserve different copy: telling someone to check their connection when
// the bug is ours would send them chasing the wrong thing.
const MODULE_LOAD_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  // Vite's own preload helper gets there first when the chunk's stylesheet is
  // the one that cannot be fetched, and rewords the failure. Observed on the
  // production build, offline: on a first attempt the boundary sees this and
  // never the engine message. Wording lives in vite's preload helper.
  /unable to preload css for/i,
  /chunkloaderror/i,
];

export function isModuleLoadError(error: unknown): boolean {
  if (error == null) return false;
  const parts = [
    (error as { name?: unknown }).name,
    (error as { message?: unknown }).message,
  ].filter((v): v is string => typeof v === "string");
  const text = parts.length > 0 ? parts.join(" ") : String(error);
  return MODULE_LOAD_PATTERNS.some((re) => re.test(text));
}
