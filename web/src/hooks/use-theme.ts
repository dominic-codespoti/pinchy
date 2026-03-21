import { useCallback, useEffect, useSyncExternalStore } from "react";

// ── Theme definitions ────────────────────────────────

const THEME_IDS = [
  "emerald",
  "midnight",
  "amber",
  "rose",
  "violet",
  "cyan",
  "copper",
  "crimson",
  "lime",
  "frost",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  readonly id: ThemeId;
  readonly label: string;
  readonly accent: string; // hex color for swatch preview
}

export const THEMES: readonly ThemeMeta[] = [
  { id: "emerald", label: "Emerald", accent: "#34d399" },
  { id: "midnight", label: "Midnight", accent: "#38bdf8" },
  { id: "amber", label: "Amber", accent: "#f59e0b" },
  { id: "rose", label: "Rose", accent: "#f472b6" },
  { id: "violet", label: "Violet", accent: "#a78bfa" },
  { id: "cyan", label: "Cyan", accent: "#22d3ee" },
  { id: "copper", label: "Copper", accent: "#e8845a" },
  { id: "crimson", label: "Crimson", accent: "#ef4444" },
  { id: "lime", label: "Lime", accent: "#a3e635" },
  { id: "frost", label: "Frost", accent: "#79c0ff" },
] as const;

// ── Storage key ──────────────────────────────────────

const STORAGE_KEY = "pinchy-theme";
const DEFAULT_THEME: ThemeId = "emerald";

// ── Validate theme id ────────────────────────────────

function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

// ── External store for cross-component sync ──────────

type Listener = () => void;
const listeners = new Set<Listener>();

function getSnapshot(): ThemeId {
  const attr = document.documentElement.getAttribute("data-theme");
  return isValidTheme(attr) ? attr : DEFAULT_THEME;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute("data-theme", id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage may be unavailable (private browsing, quota)
  }
  // Notify all subscribers
  for (const listener of listeners) {
    listener();
  }
}

// ── Hook ─────────────────────────────────────────────

export interface UseThemeReturn {
  readonly theme: ThemeId;
  readonly setTheme: (id: ThemeId) => void;
  readonly themes: readonly ThemeMeta[];
}

export function useTheme(): UseThemeReturn {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // On mount, ensure the DOM attribute matches localStorage
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const resolved = isValidTheme(stored) ? stored : DEFAULT_THEME;
    const current = document.documentElement.getAttribute("data-theme");
    if (current !== resolved) {
      applyTheme(resolved);
    }
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    applyTheme(id);
  }, []);

  return { theme, setTheme, themes: THEMES };
}
