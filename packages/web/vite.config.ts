import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Silent auto-update: the SW takes over on next load, no update-toast UI.
      registerType: 'autoUpdate',
      // Registration is wired manually in src/main.tsx via 'virtual:pwa-register'.
      injectRegister: false,
      // The manifest is owned by public/manifest.json (linked from index.html).
      // Keeping it there avoids conflicts with the parallel rebrand branch and
      // keeps a single source of truth for install metadata.
      manifest: false,
      workbox: {
        // Precache the built app shell. These globs cover the hashed JS/CSS/HTML
        // plus icons and fonts emitted into dist/.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
