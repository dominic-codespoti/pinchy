import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

export default defineConfig({
  base: "/solid/",
  plugins: [solid()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
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
    outDir: resolve(__dirname, "../static/solid"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-solid": ["solid-js", "@solidjs/router"],
          "vendor-effect": ["effect"],
        },
      },
    },
  },
});
