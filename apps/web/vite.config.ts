import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kredi · Carnet de crédit',
        short_name: 'Kredi',
        description:
          'Le carnet de crédit de votre boutique : qui vous doit combien, relance WhatsApp et paiement Mobile Money.',
        lang: 'fr',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F4EF',
        theme_color: '#0F7A55',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // L'interface est disponible hors ligne ; les données viennent toujours de l'API.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Seules les polices latines servent au français : inutile de stocker grec et cyrillique.
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/*-latin-*.woff2'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { target: 'es2022' },
});
