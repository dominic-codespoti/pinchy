import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Filter out expected WebSocket noise during dev restarts
const originalError = console.error;
console.error = (...args) => {
  const msg = args.join(" ");
  if (msg.includes("ws proxy socket error") || 
      msg.includes("ECONNRESET") || 
      msg.includes("EPIPE")) {
    return;
  }
  originalError.apply(console, args);
};

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
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../static/react"),
    emptyOutDir: true,
  },
});
