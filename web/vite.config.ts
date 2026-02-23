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
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../static/react"),
    emptyOutDir: true,
  },
});
