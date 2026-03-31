import { useState, useEffect, useCallback } from 'react';
import { hexToOklch, getOklchContrast } from '@/features/theme-editor/utils/theme-utils';

export interface CustomTheme {
  // OKLCH format: "oklch(L% C H)"
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  'muted-foreground': string;
  border: string;
  radius: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export interface ThemePreset {
  name: string;
  theme: CustomTheme;
}

const STORAGE_KEY = 'pinchy-custom-theme-v2';

// Default OKLCH values
export const defaultTheme: CustomTheme = {
  primary: 'oklch(20% 0.01 280)',
  secondary: 'oklch(95% 0.01 280)',
  accent: 'oklch(65% 0.2 250)',
  background: 'oklch(98% 0.005 280)',
  foreground: 'oklch(20% 0.01 280)',
  muted: 'oklch(95% 0.01 280)',
  'muted-foreground': 'oklch(55% 0.03 280)',
  border: 'oklch(90% 0.02 280)',
  radius: 0.5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 16,
  lineHeight: 1.5,
};

export const darkDefaultTheme: CustomTheme = {
  primary: 'oklch(98% 0.005 280)',
  secondary: 'oklch(25% 0.02 280)',
  accent: 'oklch(65% 0.2 250)',
  background: 'oklch(15% 0.02 280)',
  foreground: 'oklch(95% 0.01 280)',
  muted: 'oklch(25% 0.02 280)',
  'muted-foreground': 'oklch(65% 0.03 280)',
  border: 'oklch(30% 0.02 280)',
  radius: 0.5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 16,
  lineHeight: 1.5,
};

export const themePresets: ThemePreset[] = [
  {
    name: 'Ocean Blue',
    theme: {
      ...defaultTheme,
      accent: 'oklch(65% 0.2 250)',
      primary: 'oklch(55% 0.18 250)',
    },
  },
  {
    name: 'Forest Green',
    theme: {
      ...defaultTheme,
      accent: 'oklch(65% 0.18 145)',
      primary: 'oklch(55% 0.16 145)',
    },
  },
  {
    name: 'Royal Purple',
    theme: {
      ...defaultTheme,
      accent: 'oklch(60% 0.22 290)',
      primary: 'oklch(50% 0.2 290)',
    },
  },
  {
    name: 'Sunset Orange',
    theme: {
      ...defaultTheme,
      accent: 'oklch(70% 0.16 55)',
      primary: 'oklch(60% 0.14 55)',
    },
  },
  {
    name: 'Cherry Rose',
    theme: {
      ...defaultTheme,
      accent: 'oklch(65% 0.2 10)',
      primary: 'oklch(55% 0.18 10)',
    },
  },
  {
    name: 'Amber Gold',
    theme: {
      ...defaultTheme,
      accent: 'oklch(80% 0.12 80)',
      primary: 'oklch(70% 0.1 80)',
    },
  },
  {
    name: 'Midnight Dark',
    theme: {
      ...darkDefaultTheme,
      accent: 'oklch(70% 0.18 250)',
      primary: 'oklch(80% 0.05 250)',
    },
  },
  {
    name: 'Emerald Dark',
    theme: {
      ...darkDefaultTheme,
      accent: 'oklch(70% 0.16 145)',
      primary: 'oklch(80% 0.05 145)',
    },
  },
];

export const systemFonts = [
  { name: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { name: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { name: 'Georgia', value: 'Georgia, Cambria, serif' },
  { name: 'Monospace', value: 'Menlo, Monaco, Consolas, monospace' },
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { name: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
];

/**
 * Convert hex color to OKLCH string
 */
export function hexToOklchString(hex: string): string {
  return hexToOklch(hex);
}

/**
 * Get contrast ratio between two colors (supports OKLCH)
 */
export function getContrastRatio(color1: string, color2: string): number {
  // If both are OKLCH, use OKLCH contrast
  if (color1.startsWith('oklch') && color2.startsWith('oklch')) {
    return getOklchContrast(color1, color2);
  }
  
  // Fallback: extract lightness values and calculate simple ratio
  const l1 = extractLightness(color1);
  const l2 = extractLightness(color2);
  
  const lighter = Math.max(l1, l2) / 100;
  const darker = Math.min(l1, l2) / 100;
  
  return (lighter + 0.05) / (darker + 0.05);
}

function extractLightness(color: string): number {
  // Try to extract L from OKLch
  const oklchMatch = color.match(/oklch\((\d+(?:\.\d+)?)%/);
  if (oklchMatch) return parseFloat(oklchMatch[1]);
  
  // Fallback to mid gray
  return 50;
}

export function useCustomTheme() {
  const [theme, setThemeState] = useState<CustomTheme>(defaultTheme);
  const [isLoaded, setIsLoaded] = useState(false);
  const [history, setHistory] = useState<CustomTheme[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate it's using OKLCH format
        if (parsed.primary?.startsWith('oklch')) {
          setThemeState({ ...defaultTheme, ...parsed });
        } else {
          // Old HSL format - reset to default
          setThemeState(defaultTheme);
        }
      }

      const historyStored = localStorage.getItem(`${STORAGE_KEY}-history`);
      if (historyStored) {
        setHistory(JSON.parse(historyStored));
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsLoaded(true);
  }, []);

  const applyTheme = useCallback((newTheme: CustomTheme) => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    
    // Apply OKLCH colors directly
    root.style.setProperty('--primary', newTheme.primary);
    root.style.setProperty('--secondary', newTheme.secondary);
    root.style.setProperty('--accent', newTheme.accent);
    root.style.setProperty('--background', newTheme.background);
    root.style.setProperty('--foreground', newTheme.foreground);
    root.style.setProperty('--muted', newTheme.muted);
    root.style.setProperty('--muted-foreground', newTheme['muted-foreground']);
    root.style.setProperty('--border', newTheme.border);
    root.style.setProperty('--radius', `${newTheme.radius}rem`);
    root.style.setProperty('--font-family', newTheme.fontFamily);
    root.style.fontSize = `${newTheme.fontSize}px`;
    root.style.lineHeight = `${newTheme.lineHeight}`;
    
    // Mark as custom theme
    root.setAttribute('data-custom-theme', 'true');
  }, []);

  useEffect(() => {
    if (isLoaded) {
      applyTheme(theme);
    }
  }, [theme, isLoaded, applyTheme]);

  const setTheme = useCallback((updates: Partial<CustomTheme>) => {
    setThemeState((prev) => {
      const newTheme = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newTheme));
      }
      return newTheme;
    });
  }, []);

  const resetTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const baseTheme = isDark ? darkDefaultTheme : defaultTheme;
    setThemeState(baseTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(baseTheme));
    }
  }, []);

  const exportTheme = useCallback(() => {
    return JSON.stringify(theme, null, 2);
  }, [theme]);

  const importTheme = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      
      // Validate OKLCH format
      if (!parsed.primary?.startsWith('oklch')) {
        console.warn('Theme appears to use legacy HSL format, converting or using defaults');
      }
      
      const validated: CustomTheme = {
        ...defaultTheme,
        ...parsed,
      };
      setThemeState(validated);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const saveToHistory = useCallback(() => {
    setHistory((prev) => {
      const newHistory = [theme, ...prev].slice(0, 10);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_KEY}-history`, JSON.stringify(newHistory));
      }
      return newHistory;
    });
  }, [theme]);

  const restoreFromHistory = useCallback((index: number) => {
    if (history[index]) {
      setThemeState(history[index]);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history[index]));
      }
    }
  }, [history]);

  return {
    theme,
    setTheme,
    resetTheme,
    isLoaded,
    exportTheme,
    importTheme,
    history,
    saveToHistory,
    restoreFromHistory,
    applyTheme,
  };
}
