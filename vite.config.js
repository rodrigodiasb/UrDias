import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" funciona bem no GitHub Pages (assets relativos), sem precisar saber o nome do repositório.
// Rotas usam HashRouter (/#/...), então não dá 404 no GH Pages.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Triagem GU (offline)",
        short_name: "Triagem GU",
        description: "Coleta offline de dados de atendimentos (triagem) para guarnição.",
        theme_color: "#0b1020",
        background_color: "#0b1020",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
