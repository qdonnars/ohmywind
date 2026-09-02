// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { Suspense, lazy } from "react";

import App from "./App";
import { PlanPage } from "./routes/PlanPage";
import { ConfigPage } from "./routes/ConfigPage";
import { useRouter } from "./router";

// Les deux pages de documentation tirent react-markdown, remark/rehype, KaTeX
// et sa feuille de style : environ 470 KB bruts pour des pages rarement
// consultees, jusqu'ici embarquees dans le chunk d'entree servi a la racine.
// Chargees a la demande, elles sortent du chemin critique du premier rendu.
// Les autres routes restent statiques : /plan est la destination principale,
// la retarder d'un aller-retour reseau ne servirait rien.
const MethodologiePage = lazy(() =>
  import("./routes/MethodologiePage").then((m) => ({ default: m.MethodologiePage })),
);
const ConfidentialitePage = lazy(() =>
  import("./routes/ConfidentialitePage").then((m) => ({ default: m.ConfidentialitePage })),
);

// Les deux pages imposent un fond "papier blanc" quel que soit le theme.
// L'attente reprend ce fond pour eviter un clignotement sombre puis clair
// pendant le telechargement du chunk.
const docFallback = (
  <div className="min-h-screen" style={{ background: "#ffffff", color: "#6b7280" }}>
    <p className="max-w-3xl mx-auto px-6 py-10 text-sm">Chargement…</p>
  </div>
);

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
  if (path === "/methodologie")
    return (
      <Suspense fallback={docFallback}>
        <MethodologiePage key={key} />
      </Suspense>
    );
  if (path === "/config") return <ConfigPage key={key} />;
  if (path === "/confidentialite")
    return (
      <Suspense fallback={docFallback}>
        <ConfidentialitePage key={key} />
      </Suspense>
    );
  return <App key={key} />;
}
