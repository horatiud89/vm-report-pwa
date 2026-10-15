import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { rollupFormat: 'iife', globPatterns: ['**/*.{js,css,html,png}'] },
      manifest: {
        name: 'VM Photo Report',
        short_name: 'VM Report',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: { fs: { allow: ['..'] } },
  build: {
    // The Firebase SDK alone is about 800 kB; one cached chunk is fine for this app.
    chunkSizeWarningLimit: 1000,
    // jsPDF loads these only for html() and SVG images, which the PDF export never uses; bundled, they would add
    // three chunks (about 380 kB) that the service worker downloads for every user.
    rollupOptions: { external: ['html2canvas', 'dompurify', 'canvg'] },
  },
});
