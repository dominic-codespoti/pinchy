import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/react/",
  plugins: [tailwindcss(), react()],
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
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-codemirror": [
            "@codemirror/view",
            "@codemirror/state",
            "@codemirror/lang-yaml",
            "@codemirror/theme-one-dark",
          ],
          "vendor-markdown": [
            "react-markdown",
            "rehype-highlight",
            "remark-gfm",
          ],
          "vendor-ui": [
            "lucide-react",
            "sonner",
          ],
        },
      },
    },
  },
});
