import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",

      devOptions: {
        enabled: false,
      },

      includeAssets: [
        "favicon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
      ],

      manifest: {
        name: "Friends Search Engine",
        short_name: "FSE",
        description: "Motor de búsqueda de la serie Friends.",

        theme_color: "#001040",
        background_color: "#070814",

        display: "fullscreen",
        orientation: "portrait",

        start_url: "/fse/",
        scope: "/fse/",

        icons: [
          {
            src: "/fse/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/fse/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/fse/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],

  base: "/fse/",

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});