"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme as useNextThemes } from "next-themes";

// Theme provider props
interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: "class" | "data-theme" | "data-mode";
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  themes?: string[];
  forcedTheme?: string;
  storageKey?: string;
}

// Backward-compatible theme types
export type ThemeVariant = "light" | "dark" | "system";

export interface ThemePreset {
  id: string;
  name: string;
  category: "default" | "colorful" | "monochrome" | "nature";
  description?: string;
}

// Simple stub theme data
const defaultPreset: ThemePreset = {
  id: "default",
  name: "Default",
  category: "default",
  description: "Default shadcn/ui theme",
};

// Extended theme hook with backward-compatible API
export function useTheme() {
  const nextTheme = useNextThemes();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return {
    // Standard next-themes API
    theme: nextTheme.theme as ThemeVariant,
    setTheme: nextTheme.setTheme,
    resolvedTheme: nextTheme.resolvedTheme as "light" | "dark",
    themes: nextTheme.themes,
    systemTheme: nextTheme.systemTheme,

    // Backward-compatible aliases
    /** @deprecated Use theme instead */
    themeVariant: nextTheme.theme as ThemeVariant,
    /** @deprecated Use resolvedTheme instead */
    resolvedVariant: nextTheme.resolvedTheme as "light" | "dark",
    /** @deprecated Use setTheme instead */
    setMode: (variant: ThemeVariant) => {
      nextTheme.setTheme(variant);
    },
    /** @deprecated Use setTheme instead */
    setThemeVariant: (variant: ThemeVariant) => {
      nextTheme.setTheme(variant);
    },

    // Stub color theme API for backward compatibility
    colorTheme: defaultPreset,
    currentTheme: defaultPreset,
    hasPaletteActive: false,
    /** @deprecated No longer supported - only light/dark/system modes */
    setColorTheme: (_id?: string) => {
      console.warn("Color themes no longer supported - use light/dark/system instead");
    },
    clearColorTheme: () => {
      console.warn("Color themes no longer supported - use light/dark/system instead");
    },
    /** @deprecated No longer supported */
    allThemes: [defaultPreset],
    /** @deprecated No longer supported */
    categories: [{ id: "default", name: "Default", description: "Default theme" }],
    /** @deprecated No longer supported */
    getThemesByCategory: () => [defaultPreset],
    /** @deprecated No longer supported */
    isTransitioning: false,
  };
}

// Simple theme provider using next-themes
export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// Stub exports for backward compatibility
export const themePresets: ThemePreset[] = [defaultPreset];

export const themeCategories = [
  { id: "default", name: "Default", description: "Default theme" },
] as const;

export function getThemeById(id: string): ThemePreset | undefined {
  return themePresets.find((t) => t.id === id);
}

export type { ThemeProviderProps };
