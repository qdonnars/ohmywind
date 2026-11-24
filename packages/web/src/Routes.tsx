// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { useEffect } from "react";
import App from "./App";
import { PlanPage } from "./routes/PlanPage";
import { ComparePage } from "./routes/ComparePage";
import { PressPage } from "./routes/PressPage";
import { openSettings } from "./config/openSettings";
import { navigate } from "./navigation";
import { LazyPageBoundary } from "./components/LazyPageBoundary";
import { NotFoundPage } from "./routes/NotFoundPage";
import { useT } from "./i18n";
import { matchRoute } from "./routeTable";
import { useRouter } from "./router";

// Les deux pages de documentation tirent react-markdown, remark/rehype, KaTeX
// et sa feuille de style : environ 470 KB bruts pour des pages rarement
// consultees, jusqu'ici embarquees dans le chunk d'entree servi a la racine.
// Chargees a la demande, elles sortent du chemin critique du premier rendu.
// Les autres routes restent statiques : /plan est la destination principale,
// la retarder d'un aller-retour reseau ne servirait rien.
//
// Leur chunk est au precache du service worker (plugins/precache.ts, verifie
// par tests/offlineRoutes.test.ts) : une fois le worker installe, chaque page
// s'ouvre hors ligne. Avant cela (premiere visite coupee en route, navigateur
// sans service worker), l'import peut echouer : LazyPageBoundary porte le
// Suspense et rattrape cet echec, sinon l'erreur remonte jusqu'a la racine et
// React demonte toute l'application.
//
// Les fonctions de chargement sont definies au niveau du module pour rester
// stables d'un rendu a l'autre : c'est leur identite qui sert de cle au cache
// de payloads lazy de la boundary.
const loadMethodologie = () =>
  import("./routes/MethodologiePage").then((m) => ({ default: m.MethodologiePage }));
const loadMethodologieCourants = () =>
  import("./routes/MethodologiePage").then((m) => ({ default: m.MethodologieCourantsPage }));
const loadConfidentialite = () =>
  import("./routes/ConfidentialitePage").then((m) => ({ default: m.ConfidentialitePage }));
const loadConditions = () => import("./routes/ConditionsPage").then((m) => ({ default: m.ConditionsPage }));
// Le journal des versions tire lui aussi react-markdown et les deux
// CHANGELOG : meme traitement que les pages de documentation, a la demande.
const loadWhatsNew = () => import("./routes/WhatsNewPage").then((m) => ({ default: m.WhatsNewPage }));
// La page « À propos » n'a ni carte ni markdown : petite, chargee a la
// demande quand meme, puisque plus rien dans l'en-tete ne l'importe.
const loadAbout = () => import("./routes/AboutPage").then((m) => ({ default: m.AboutPage }));
// Le communique de presse tire lui aussi react-markdown, pour une page que
// seuls les journalistes ouvriront : meme traitement, a la demande.
const loadPressRelease = () =>
  import("./routes/PressReleasePage").then((m) => ({ default: m.PressReleasePage }));
// La page de transfert ne s'ouvre que depuis l'application native, une fois
// par installation : rien a faire payer au chunk d'entree.
const loadTransfer = () => import("./routes/TransferPage").then((m) => ({ default: m.TransferPage }));

// Toutes les pages chargees a la demande suivent le theme de l'application :
// leur attente prend donc les jetons du theme, pour ne pas clignoter d'un
// fond a l'autre pendant le telechargement du chunk.
//
// Un composant, et non un element construit une fois au chargement du module :
// il lit la langue active au moment ou il s'affiche, pas celle du demarrage.
function AppPageFallback() {
  const { t } = useT();
  return (
    <div className="min-h-screen" style={{ background: "var(--ow-bg-0)", color: "var(--ow-fg-1)" }}>
      <p className="max-w-3xl mx-auto px-6 py-10 text-sm">{t("common.loading")}</p>
    </div>
  );
}

// Le communique suit le theme de l'application, comme /presse : son attente
// aussi, sur les classes de press.css, deja chargee avec la page presse.
function PressFallback() {
  const { t } = useT();
  return (
    <div className="press-root min-h-screen">
      <p className="max-w-3xl mx-auto px-6 py-10 text-sm" style={{ color: "var(--ow-fg-2)" }}>
        {t("common.loading")}
      </p>
    </div>
  );
}

/**
 * Path to page, resolved client-side.
 *
 * Lives apart from `main.tsx` so the entry point keeps exporting nothing and
 * fast refresh stays happy.
 */
export function Routes() {
  const { path } = useRouter();
  const route = matchRoute(path);

  // /config is no page of its own any more: the settings open over any page
  // (`openSettings()`). The address stays, for the links already out there
  // (the launcher shortcut of the manifest, the app links of the native
  // shell, a bookmark): it opens the explorer with the settings over it. The
  // address becomes the explorer's before the settings take their history
  // entry, so closing them leaves the reader on the map, and a back press
  // from there leaves the app as it would from any page opened directly.
  useEffect(() => {
    if (route !== "config") return;
    navigate("/", { replace: true });
    openSettings();
  }, [route]);

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

  switch (route) {
    case "plan":
      return <PlanPage key={key} />;
    case "compare":
      return <ComparePage key={key} />;
    case "press":
      return <PressPage key={key} />;
    case "press-release":
      return <LazyPageBoundary key={key} load={loadPressRelease} fallback={<PressFallback />} />;
    case "methodologie":
      return <LazyPageBoundary key={key} load={loadMethodologie} fallback={<AppPageFallback />} />;
    case "methodologie-courants":
      return <LazyPageBoundary key={key} load={loadMethodologieCourants} fallback={<AppPageFallback />} />;
    case "confidentialite":
      return <LazyPageBoundary key={key} load={loadConfidentialite} fallback={<AppPageFallback />} />;
    case "conditions":
      return <LazyPageBoundary key={key} load={loadConditions} fallback={<AppPageFallback />} />;
    case "about":
      return <LazyPageBoundary key={key} load={loadAbout} fallback={<AppPageFallback />} />;
    case "whats-new":
      return <LazyPageBoundary key={key} load={loadWhatsNew} fallback={<AppPageFallback />} />;
    case "transfer":
      return <LazyPageBoundary key={key} load={loadTransfer} fallback={<AppPageFallback />} />;
    case "not-found":
      return <NotFoundPage key={key} />;
    // One key for the two: rewriting /config into / must not remount the
    // explorer under the settings that were just opened over it.
    case "config":
    case "explore":
      return <App key="/" />;
  }
}
