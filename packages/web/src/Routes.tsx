// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import App from "./App";
import { PlanPage } from "./routes/PlanPage";
import { MethodologiePage } from "./routes/MethodologiePage";
import { ConfigPage } from "./routes/ConfigPage";
import { ConfidentialitePage } from "./routes/ConfidentialitePage";
import { useRouter } from "./router";

/**
 * Path to page, resolved client-side.
 *
 * Lives apart from `main.tsx` so the entry point keeps exporting nothing and
 * fast refresh stays happy.
 */
export function Routes() {
  const { path, search } = useRouter();

  // Keyed on the full URL so a navigation remounts the page, which is what
  // the pages already expect: each reads its query string once, at mount.
  // What changes versus the previous full document load is everything around
  // it. The shell, the theme and the parsed script all survive, so switching
  // mode no longer blanks the app.
  const key = path + search;

  if (path === "/plan") return <PlanPage key={key} />;
  if (path === "/methodologie") return <MethodologiePage key={key} />;
  if (path === "/config") return <ConfigPage key={key} />;
  if (path === "/confidentialite") return <ConfidentialitePage key={key} />;
  return <App key={key} />;
}
