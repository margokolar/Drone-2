import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Self-signed HTTPS so the microphone (getUserMedia) works when testing
    // from a phone on the same Wi-Fi. Trust the certificate on the phone the
    // first time you open the dev URL.
    basicSsl(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'apple-touch-icon-180.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
      manifest: {
        id: '/',
        name: 'Drone 3',
        short_name: 'Drone 3',
        description: 'Experimental drone reference tool',
        theme_color: '#141319',
        background_color: '#141319',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
})
