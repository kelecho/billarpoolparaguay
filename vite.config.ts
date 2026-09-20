import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      id: '/', name: 'BillarPool Guaraní · Ranking', short_name: 'BillarPool',
      description: 'BillarPool Guaraní: jugadores, torneos y ranking del pool paraguayo.',
      lang: 'es-PY', start_url: '/', scope: '/', display: 'standalone',
      background_color: '#f0f3f3', theme_color: '#163d67',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallbackDenylist: [/^\/api\//, /^\/admin/, /^\/cdn-cgi\//],
      // Cada dirección de foto es inmutable: una vez vista queda disponible sin conexión.
      runtimeCaching: [{ urlPattern: /\/api\/photos\//, handler: 'CacheFirst', options: { cacheName: 'player-photos', expiration: { maxEntries: 1000 } } }],
    },
  })],
});
