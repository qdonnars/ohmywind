// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

/**
 * Which page a path resolves to.
 *
 * A plain function rather than a table inside `Routes.tsx`, so the routing
 * rules can be read and tested without mounting an application that pulls in
 * Leaflet and MapLibre. It is also where "no route matched" became a case of
 * its own: until now the explore page was the fallback, so a typo in a URL, a
 * stale bookmark or a crawler on `/plans` got the map under the wrong address,
 * with nothing saying so.
 */

export type RouteName =
  | "explore"
  | "plan"
  | "config"
  | "methodologie"
  | "confidentialite"
  | "not-found";

// A Map rather than an object literal: a path is untrusted input, and an
// object lookup answers "/constructor" with a function from the prototype
// chain. The leading slash makes that unreachable in practice, which is
// exactly the kind of reasoning a Map spares the next reader.
const ROUTES = new Map<string, RouteName>([
  ["/", "explore"],
  ["/plan", "plan"],
  ["/config", "config"],
  ["/methodologie", "methodologie"],
  ["/confidentialite", "confidentialite"],
]);

/** `path` is expected already normalised (see `navigation.normalisePath`). */
export function matchRoute(path: string): RouteName {
  return ROUTES.get(path) ?? "not-found";
}
