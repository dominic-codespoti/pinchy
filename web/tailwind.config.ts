import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All colors reference CSS custom properties so themes swap correctly
        surface: {
          0: "var(--color-surface-0)",
          1: "var(--color-surface-1)",
          2: "var(--color-surface-2)",
        },
        accent: "var(--color-accent)",
        "accent-fg": "var(--color-accent-fg)",
        "accent-subtle": "var(--color-accent-subtle)",
        "accent-muted": "var(--color-accent-muted)",
        danger: "var(--color-danger)",
        "danger-subtle": "var(--color-danger-subtle)",
        warning: "var(--color-warning)",
        "warning-subtle": "var(--color-warning-subtle)",
        success: "var(--color-success)",
        "success-subtle": "var(--color-success-subtle)",
        info: "var(--color-info)",
        "info-subtle": "var(--color-info-subtle)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        ring: "var(--color-ring)",
        "text-1": "var(--color-text-1)",
        "text-2": "var(--color-text-2)",
        "text-3": "var(--color-text-3)",
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        ring: "var(--shadow-ring)",
        elevated: "var(--shadow-elevated)",
        dropdown: "var(--shadow-dropdown)",
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
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
