import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#16181d",
        base: "#0f1115",
        ink: "#ebf0fa",
        mute: "#9ca9bf",
        accent: "#34d399",
        danger: "#f87171",
        success: "#4ade80",
      },
      boxShadow: {
        shell: "0 24px 56px rgba(0,0,0,.35)",
        glass: "0 8px 32px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)",
        glow: "0 0 15px rgba(52,211,153,.2)",
        "glow-strong": "0 0 25px rgba(52,211,153,.35)",
        "glow-card": "0 8px 32px rgba(0,0,0,.25), 0 0 15px rgba(52,211,153,.15)",
      },
      backdropBlur: {
        glass: "16px",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(52,211,153,.2)" },
          "50%": { boxShadow: "0 0 16px rgba(52,211,153,.4)" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.3)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
