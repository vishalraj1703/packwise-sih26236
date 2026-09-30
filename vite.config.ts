import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "PackWise - Food Packaging Advisor",
        short_name: "PackWise",
        description: "Evidence-backed food packaging recommendations, packing guides and batch traceability.",
        theme_color: "#0f3d3e",
        background_color: "#f6f8f7",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/examples") || url.pathname.startsWith("/uploads/examples"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "knowledge-library" }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    port: 5173,
    proxy: Object.fromEntries(["/api", "/uploads", "/01"].map((k) => [k, {
      target: "http://localhost:8787",
      configure: (proxy: any) => proxy.on("proxyReq", (proxyReq: any, req: any) => proxyReq.setHeader("x-forwarded-host", req.headers.host))
    }]))
  },
  test: { include: ["tests/**/*.test.ts"] }
} as any);
