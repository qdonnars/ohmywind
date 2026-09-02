import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // MapLibre GL (the basemap renderer) is bigger than the rest of the
        // app put together, and it changes only when we bump the dependency.
        // Left in the entry chunk it blew past workbox's 2 MiB per-file
        // precache limit and, worse, made every app deploy re-download it.
        // Its own chunk keeps the hash stable across our releases, so a
        // returning user pays for it once.
        advancedChunks: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ }],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The new worker is announced, not applied: 'autoUpdate' made the
      // plugin's client call window.location.reload() by itself the instant a
      // worker activated, which wiped any route drawn and not yet computed.
      // Still no update-toast UI: src/sw.ts applies the update on its own, at
      // a moment that costs the reader nothing.
      registerType: 'prompt',
      // Registration is wired manually in src/main.tsx via 'virtual:pwa-register'.
      injectRegister: false,
      // The manifest is owned by public/manifest.json (linked from index.html).
      // Keeping it there avoids conflicts with the parallel rebrand branch and
      // keeps a single source of truth for install metadata.
      manifest: false,
      workbox: {
        // No unconditional skipWaiting in the worker: with it false, Workbox
        // emits a SKIP_WAITING message listener instead, and src/sw.ts is the
        // one that decides when to send it. The reason skipWaiting was here in
        // the first place is unchanged and still honoured: a freshly deployed
        // worker must not sit in 'waiting' for as long as one tab controlled
        // by the old one survives, which on a phone is forever. It is now
        // src/sw.ts that guarantees the swap happens within the session.
        skipWaiting: false,
        // Kept: the new worker claims the open pages as soon as it activates,
        // so the reload lands on the new shell rather than one load later.
        clientsClaim: true,
        // Precache the built app shell. These globs cover the hashed JS/CSS/HTML
        // plus icons and fonts emitted into dist/. ``mjs`` is there for
        // MapLibre's tile worker, which ships as its own module file.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        // Ce qui n'appartient qu'aux pages de documentation reste en ligne:
        // les polices KaTeX, la carte de couverture et les diagrammes de
        // polaires ne servent qu'a /methodologie, chargee a la demande. Les
        // precacher coutait ~330 KB de reseau a la premiere visite et autant
        // de stockage, pour des pages que la plupart des visiteurs n'ouvrent
        // jamais et qui n'ont pas besoin de fonctionner hors ligne.
        // /methodologie et /confidentialite sont chargees a la demande et n'ont
        // aucune raison de fonctionner hors ligne : ce sont des pages de
        // lecture, pas la coque de l'application. Restent donc hors precache
        // leurs chunks, leur CSS, le schema de segmentation et les polices
        // KaTeX. Le chunk partage lib-*.js n'est importe que par ces deux
        // pages (verifie sur la sortie de build : le chunk d'entree n'importe
        // que maplibre et le runtime rolldown) ; si un jour l'entree en
        // dependait, il faudrait le remettre au precache sous peine de casser
        // le mode hors ligne.
        globIgnores: [
          '**/KaTeX_*',
          'methodologie/**',
          'polars/**',
          '**/MethodologiePage-*',
          '**/ConfidentialitePage-*',
          '**/lib-*.js',
          '**/segmentation-*.svg',
        ],
        // compass.png et favicon.svg vivent dans public/ : leur nom ne porte
        // pas de hash, donc Workbox les precache avec une requete
        // ?__WB_REVISION__=... qui contourne le cache HTTP et les retelecharge
        // alors que la page vient tout juste de les tirer. Les declarer ici les
        // fait entrer au precache en revision nulle : une seule requete, servie
        // depuis le cache HTTP du navigateur.
        //
        // Le `^assets/` reprend la valeur que vite-plugin-pwa pose par defaut
        // (`new RegExp('^' + assetsDir)`). Cette option remplace ce defaut au
        // lieu de s'y ajouter : l'oublier redonnerait une revision a tout le
        // bundle hache, soit un precache entierement reconstruit a chaque
        // deploiement.
        //
        // Contrepartie a connaitre pour les deux fichiers de public/ : ils
        // deviennent immuables aux yeux du precache. Si leur contenu change un
        // jour, il faut changer leur nom (suffixe de version), sinon les
        // installations existantes gardent l'ancienne version. index.html n'est
        // volontairement pas de la partie, son contenu change a chaque
        // deploiement.
        //
        // Les polices, elles, sont passees par src/assets : Vite les hache et
        // les sert depuis /assets/, ou elles entrent au precache en revision
        // nulle sans rien declarer et heritent du Cache-Control immutable d'un
        // an de _headers.
        dontCacheBustURLsMatching: /^assets\/|^(compass\.png|favicon\.svg)$/,
        // Drop stale precaches when a new SW activates.
        cleanupOutdatedCaches: true,
        // SPA fallback so deep links (/plan, /config, ...) resolve offline.
        navigateFallback: '/index.html',
        // No runtimeCaching on purpose: Leaflet map tiles and the Open-Meteo /
        // MCP APIs must always hit the network (fresh marine data, avoid a fat
        // opaque cache). Only the static app shell is cached for offline res.
      },
      devOptions: {
        // Keep `npm run dev` free of the service worker.
        enabled: false,
      },
    }),
  ],
})
