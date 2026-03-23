import { createSignal, createRoot } from "solid-js";

// ── Theme definitions ───────────────────────────────

const THEME_IDS = [
  "zinc", "ember", "ocean", "aurora", "dusk", "moss", "slate", "ruby",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  readonly id: ThemeId;
  readonly label: string;
  readonly swatch: string;
}

export const THEMES: readonly ThemeMeta[] = [
  { id: "zinc",   label: "Zinc",   swatch: "#a1a1aa" },
  { id: "ember",  label: "Ember",  swatch: "#f97316" },
  { id: "ocean",  label: "Ocean",  swatch: "#06b6d4" },
  { id: "aurora", label: "Aurora", swatch: "#a78bfa" },
  { id: "dusk",   label: "Dusk",   swatch: "#f472b6" },
  { id: "moss",   label: "Moss",   swatch: "#22c55e" },
  { id: "slate",  label: "Slate",  swatch: "#64748b" },
  { id: "ruby",   label: "Ruby",   swatch: "#ef4444" },
] as const;

type ThemeTokens = Record<string, string>;

const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  zinc: {},

  ember: {
    "--background": "oklch(0.14 0.008 55)",
    "--foreground": "oklch(0.96 0.01 70)",
    "--card": "oklch(0.19 0.012 55)",
    "--card-foreground": "oklch(0.96 0.01 70)",
    "--popover": "oklch(0.19 0.012 55)",
    "--popover-foreground": "oklch(0.96 0.01 70)",
    "--primary": "oklch(0.75 0.16 50)",
    "--primary-foreground": "oklch(0.16 0.01 50)",
    "--secondary": "oklch(0.26 0.015 55)",
    "--secondary-foreground": "oklch(0.96 0.01 70)",
    "--muted": "oklch(0.26 0.015 55)",
    "--muted-foreground": "oklch(0.65 0.02 55)",
    "--accent": "oklch(0.33 0.02 55)",
    "--accent-foreground": "oklch(0.96 0.01 70)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.75 0.16 50)",
    "--sidebar": "oklch(0.17 0.01 55)",
    "--sidebar-foreground": "oklch(0.96 0.01 70)",
    "--sidebar-primary": "oklch(0.75 0.16 50)",
    "--sidebar-primary-foreground": "oklch(0.96 0.01 70)",
    "--sidebar-accent": "oklch(0.26 0.015 55)",
    "--sidebar-accent-foreground": "oklch(0.96 0.01 70)",
    "--sidebar-border": "oklch(1 0 0 / 10%)",
    "--sidebar-ring": "oklch(0.5 0.06 50)",
  },

  ocean: {
    "--background": "oklch(0.14 0.01 230)",
    "--foreground": "oklch(0.96 0.008 220)",
    "--card": "oklch(0.19 0.015 230)",
    "--card-foreground": "oklch(0.96 0.008 220)",
    "--popover": "oklch(0.19 0.015 230)",
    "--popover-foreground": "oklch(0.96 0.008 220)",
    "--primary": "oklch(0.75 0.12 200)",
    "--primary-foreground": "oklch(0.16 0.015 230)",
    "--secondary": "oklch(0.26 0.018 230)",
    "--secondary-foreground": "oklch(0.96 0.008 220)",
    "--muted": "oklch(0.26 0.018 230)",
    "--muted-foreground": "oklch(0.65 0.02 220)",
    "--accent": "oklch(0.33 0.025 230)",
    "--accent-foreground": "oklch(0.96 0.008 220)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.7 0.04 220 / 12%)",
    "--input": "oklch(0.7 0.04 220 / 18%)",
    "--ring": "oklch(0.75 0.12 200)",
    "--sidebar": "oklch(0.17 0.012 230)",
    "--sidebar-foreground": "oklch(0.96 0.008 220)",
    "--sidebar-primary": "oklch(0.75 0.12 200)",
    "--sidebar-primary-foreground": "oklch(0.96 0.008 220)",
    "--sidebar-accent": "oklch(0.26 0.018 230)",
    "--sidebar-accent-foreground": "oklch(0.96 0.008 220)",
    "--sidebar-border": "oklch(0.7 0.04 220 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.06 220)",
  },

  aurora: {
    "--background": "oklch(0.14 0.012 280)",
    "--foreground": "oklch(0.96 0.01 290)",
    "--card": "oklch(0.19 0.018 280)",
    "--card-foreground": "oklch(0.96 0.01 290)",
    "--popover": "oklch(0.19 0.018 280)",
    "--popover-foreground": "oklch(0.96 0.01 290)",
    "--primary": "oklch(0.72 0.17 285)",
    "--primary-foreground": "oklch(0.16 0.015 280)",
    "--secondary": "oklch(0.26 0.02 280)",
    "--secondary-foreground": "oklch(0.96 0.01 290)",
    "--muted": "oklch(0.26 0.02 280)",
    "--muted-foreground": "oklch(0.65 0.025 280)",
    "--accent": "oklch(0.33 0.03 280)",
    "--accent-foreground": "oklch(0.96 0.01 290)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.7 0.04 280 / 12%)",
    "--input": "oklch(0.7 0.04 280 / 18%)",
    "--ring": "oklch(0.72 0.17 285)",
    "--sidebar": "oklch(0.17 0.015 280)",
    "--sidebar-foreground": "oklch(0.96 0.01 290)",
    "--sidebar-primary": "oklch(0.72 0.17 285)",
    "--sidebar-primary-foreground": "oklch(0.96 0.01 290)",
    "--sidebar-accent": "oklch(0.26 0.02 280)",
    "--sidebar-accent-foreground": "oklch(0.96 0.01 290)",
    "--sidebar-border": "oklch(0.7 0.04 280 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.07 280)",
  },

  dusk: {
    "--background": "oklch(0.14 0.012 340)",
    "--foreground": "oklch(0.96 0.01 340)",
    "--card": "oklch(0.19 0.016 340)",
    "--card-foreground": "oklch(0.96 0.01 340)",
    "--popover": "oklch(0.19 0.016 340)",
    "--popover-foreground": "oklch(0.96 0.01 340)",
    "--primary": "oklch(0.72 0.16 340)",
    "--primary-foreground": "oklch(0.16 0.012 340)",
    "--secondary": "oklch(0.26 0.018 340)",
    "--secondary-foreground": "oklch(0.96 0.01 340)",
    "--muted": "oklch(0.26 0.018 340)",
    "--muted-foreground": "oklch(0.65 0.02 340)",
    "--accent": "oklch(0.33 0.025 340)",
    "--accent-foreground": "oklch(0.96 0.01 340)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.7 0.04 340 / 12%)",
    "--input": "oklch(0.7 0.04 340 / 18%)",
    "--ring": "oklch(0.72 0.16 340)",
    "--sidebar": "oklch(0.17 0.014 340)",
    "--sidebar-foreground": "oklch(0.96 0.01 340)",
    "--sidebar-primary": "oklch(0.72 0.16 340)",
    "--sidebar-primary-foreground": "oklch(0.96 0.01 340)",
    "--sidebar-accent": "oklch(0.26 0.018 340)",
    "--sidebar-accent-foreground": "oklch(0.96 0.01 340)",
    "--sidebar-border": "oklch(0.7 0.04 340 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.06 340)",
  },

  moss: {
    "--background": "oklch(0.14 0.012 145)",
    "--foreground": "oklch(0.96 0.01 145)",
    "--card": "oklch(0.19 0.016 145)",
    "--card-foreground": "oklch(0.96 0.01 145)",
    "--popover": "oklch(0.19 0.016 145)",
    "--popover-foreground": "oklch(0.96 0.01 145)",
    "--primary": "oklch(0.72 0.16 150)",
    "--primary-foreground": "oklch(0.16 0.012 145)",
    "--secondary": "oklch(0.26 0.018 145)",
    "--secondary-foreground": "oklch(0.96 0.01 145)",
    "--muted": "oklch(0.26 0.018 145)",
    "--muted-foreground": "oklch(0.65 0.02 145)",
    "--accent": "oklch(0.33 0.025 145)",
    "--accent-foreground": "oklch(0.96 0.01 145)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.7 0.04 145 / 12%)",
    "--input": "oklch(0.7 0.04 145 / 18%)",
    "--ring": "oklch(0.72 0.16 150)",
    "--sidebar": "oklch(0.17 0.014 145)",
    "--sidebar-foreground": "oklch(0.96 0.01 145)",
    "--sidebar-primary": "oklch(0.72 0.16 150)",
    "--sidebar-primary-foreground": "oklch(0.96 0.01 145)",
    "--sidebar-accent": "oklch(0.26 0.018 145)",
    "--sidebar-accent-foreground": "oklch(0.96 0.01 145)",
    "--sidebar-border": "oklch(0.7 0.04 145 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.06 145)",
  },

  slate: {
    "--background": "oklch(0.16 0.006 250)",
    "--foreground": "oklch(0.94 0.005 250)",
    "--card": "oklch(0.21 0.008 250)",
    "--card-foreground": "oklch(0.94 0.005 250)",
    "--popover": "oklch(0.21 0.008 250)",
    "--popover-foreground": "oklch(0.94 0.005 250)",
    "--primary": "oklch(0.70 0.035 250)",
    "--primary-foreground": "oklch(0.16 0.006 250)",
    "--secondary": "oklch(0.28 0.01 250)",
    "--secondary-foreground": "oklch(0.94 0.005 250)",
    "--muted": "oklch(0.28 0.01 250)",
    "--muted-foreground": "oklch(0.60 0.012 250)",
    "--accent": "oklch(0.34 0.012 250)",
    "--accent-foreground": "oklch(0.94 0.005 250)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.65 0.01 250 / 12%)",
    "--input": "oklch(0.65 0.01 250 / 18%)",
    "--ring": "oklch(0.70 0.035 250)",
    "--sidebar": "oklch(0.18 0.007 250)",
    "--sidebar-foreground": "oklch(0.94 0.005 250)",
    "--sidebar-primary": "oklch(0.70 0.035 250)",
    "--sidebar-primary-foreground": "oklch(0.94 0.005 250)",
    "--sidebar-accent": "oklch(0.28 0.01 250)",
    "--sidebar-accent-foreground": "oklch(0.94 0.005 250)",
    "--sidebar-border": "oklch(0.65 0.01 250 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.015 250)",
  },

  ruby: {
    "--background": "oklch(0.14 0.01 15)",
    "--foreground": "oklch(0.96 0.008 15)",
    "--card": "oklch(0.19 0.014 15)",
    "--card-foreground": "oklch(0.96 0.008 15)",
    "--popover": "oklch(0.19 0.014 15)",
    "--popover-foreground": "oklch(0.96 0.008 15)",
    "--primary": "oklch(0.65 0.2 25)",
    "--primary-foreground": "oklch(0.96 0.008 15)",
    "--secondary": "oklch(0.26 0.016 15)",
    "--secondary-foreground": "oklch(0.96 0.008 15)",
    "--muted": "oklch(0.26 0.016 15)",
    "--muted-foreground": "oklch(0.65 0.02 15)",
    "--accent": "oklch(0.33 0.022 15)",
    "--accent-foreground": "oklch(0.96 0.008 15)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(0.7 0.04 15 / 12%)",
    "--input": "oklch(0.7 0.04 15 / 18%)",
    "--ring": "oklch(0.65 0.2 25)",
    "--sidebar": "oklch(0.17 0.012 15)",
    "--sidebar-foreground": "oklch(0.96 0.008 15)",
    "--sidebar-primary": "oklch(0.65 0.2 25)",
    "--sidebar-primary-foreground": "oklch(0.96 0.008 15)",
    "--sidebar-accent": "oklch(0.26 0.016 15)",
    "--sidebar-accent-foreground": "oklch(0.96 0.008 15)",
    "--sidebar-border": "oklch(0.7 0.04 15 / 12%)",
    "--sidebar-ring": "oklch(0.5 0.08 15)",
  },
};

// CSS variable names to manage
const CSS_VARS = Object.keys(THEME_TOKENS.ember);
const STORAGE_KEY = "pinchy-theme";
const DEFAULT_THEME: ThemeId = "zinc";

function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

function applyThemeToDOM(id: ThemeId): void {
  const tokens = THEME_TOKENS[id];
  const style = document.documentElement.style;

  if (id === DEFAULT_THEME) {
    for (const v of CSS_VARS) style.removeProperty(v);
  } else {
    for (const v of CSS_VARS) {
      const val = tokens[v];
      if (val) {
        style.setProperty(v, val);
      } else {
        style.removeProperty(v);
      }
    }
  }

  document.documentElement.setAttribute("data-theme", id);

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage unavailable
  }
}

// Read initial theme from localStorage
function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// ── Global singleton signal (created outside component tree) ──

export const themeStore = createRoot(() => {
  const initial = readStoredTheme();
  const [theme, setThemeSignal] = createSignal<ThemeId>(initial);

  // Apply on init
  applyThemeToDOM(initial);

  function setTheme(id: ThemeId): void {
    applyThemeToDOM(id);
    setThemeSignal(id);
  }

  return { theme, setTheme, themes: THEMES } as const;
});
