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
