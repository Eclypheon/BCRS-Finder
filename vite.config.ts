import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/BCRS-Finder/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      base: '/BCRS-Finder/',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'BCRS Finder - Singapore',
        short_name: 'BCRS Finder',
        description: 'Find nearest Beverage Container Return Scheme reverse vending machines in Singapore with live status and 1-tap navigation',
        theme_color: '#059669',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/BCRS-Finder/',
        start_url: '/BCRS-Finder/',
        categories: ['utilities', 'navigation', 'sustainability'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // Ensure live edge proxy is ALWAYS fetched from network directly
            urlPattern: /^https:\/\/.*\.workers\.dev\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /.*\/data\/seed-rvms\.json.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bcrs-seed-data-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 3, // 3 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/www\.onemap\.gov\.sg\/maps\/tiles\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onemap-tiles-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/www\.onemap\.gov\.sg\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'onemap-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/leaflet')) return 'leaflet';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
