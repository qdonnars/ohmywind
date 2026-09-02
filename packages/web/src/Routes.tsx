// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import App from "./App";
import { PlanPage } from "./routes/PlanPage";
import { ConfigPage } from "./routes/ConfigPage";
import { LazyPageBoundary } from "./components/LazyPageBoundary";
import { NotFoundPage } from "./routes/NotFoundPage";
import { matchRoute } from "./routeTable";
import { useRouter } from "./router";

// Les deux pages de documentation tirent react-markdown, remark/rehype, KaTeX
// et sa feuille de style : environ 470 KB bruts pour des pages rarement
// consultees, jusqu'ici embarquees dans le chunk d'entree servi a la racine.
// Chargees a la demande, elles sortent du chemin critique du premier rendu.
// Les autres routes restent statiques : /plan est la destination principale,
// la retarder d'un aller-retour reseau ne servirait rien.
//
// Elles sont aussi tenues hors du precache du service worker, donc leur chunk
// peut manquer : hors ligne, l'import echoue. LazyPageBoundary porte le
// Suspense et rattrape cet echec, sinon l'erreur remonte jusqu'a la racine et
// React demonte toute l'application.
//
// Les fonctions de chargement sont definies au niveau du module pour rester
// stables d'un rendu a l'autre : c'est leur identite qui sert de cle au cache
// de payloads lazy de la boundary.
const loadMethodologie = () =>
  import("./routes/MethodologiePage").then((m) => ({ default: m.MethodologiePage }));
const loadConfidentialite = () =>
  import("./routes/ConfidentialitePage").then((m) => ({ default: m.ConfidentialitePage }));

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
  const { path } = useRouter();

  // Keyed on the path alone, deliberately not on the full URL. A navigation
  // still remounts the page, which is what the pages expect: each reads its
  // query string once, at mount. What must not remount it is a *rewrite* of
  // the query string on the page one is already on, and `/plan` does exactly
  // that at mount when it restores a route from the cache. Keyed on the full
  // URL, the next back press (closing a panel) re-read the location, saw a
  // new key, and remounted the planner from its draft with the computed
  // results gone. No link in the app goes from one query string to another
  // under the same path, so the path is a sufficient key.
  const key = path;

  switch (matchRoute(path)) {
    case "plan":
      return <PlanPage key={key} />;
    case "config":
      return <ConfigPage key={key} />;
    case "methodologie":
      return <LazyPageBoundary key={key} load={loadMethodologie} fallback={docFallback} />;
    case "confidentialite":
      return <LazyPageBoundary key={key} load={loadConfidentialite} fallback={docFallback} />;
    case "not-found":
      return <NotFoundPage key={key} />;
    case "explore":
      return <App key={key} />;
  }
}
