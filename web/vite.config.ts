import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "/react/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3131",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3131",
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            // Suppress expected WebSocket errors (browser disconnects during HMR)
            if ("code" in err && err.code === "ECONNRESET") {
              return;
            }
            console.warn("[vite] ws proxy error:", err.message);
          });
        },
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../static/react"),
    emptyOutDir: true,
  },
});
