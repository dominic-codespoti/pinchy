/**
 * Theme Editor feature utilities
 * OKLCH color system and theme generation
 */

import { ColorTheme, ColorThemeConfig, OklchColor } from '../types';

// OKLCH Color palette
// Format: oklch(Lightness% Chroma Hue)
export const OKLCH = {
  // Primary blue scale
  blue: {
    400: 'oklch(70% 0.18 250)',
    500: 'oklch(65% 0.2 250)',
    600: 'oklch(55% 0.18 250)',
  },
  // Green scale
  green: {
    400: 'oklch(75% 0.2 145)',
    500: 'oklch(65% 0.18 145)',
    600: 'oklch(55% 0.16 145)',
  },
  // Purple scale
  purple: {
    400: 'oklch(70% 0.2 290)',
    500: 'oklch(60% 0.22 290)',
    600: 'oklch(50% 0.2 290)',
  },
  // Orange scale
  orange: {
    400: 'oklch(75% 0.18 55)',
    500: 'oklch(70% 0.16 55)',
    600: 'oklch(60% 0.14 55)',
  },
  // Rose/pink scale
  rose: {
    400: 'oklch(75% 0.18 10)',
    500: 'oklch(65% 0.2 10)',
    600: 'oklch(55% 0.18 10)',
  },
  // Amber/yellow scale
  amber: {
    400: 'oklch(85% 0.14 80)',
    500: 'oklch(80% 0.12 80)',
    600: 'oklch(70% 0.1 80)',
  },
  // Teal scale
  teal: {
    400: 'oklch(75% 0.14 175)',
    500: 'oklch(65% 0.16 175)',
    600: 'oklch(55% 0.14 175)',
  },
  // Indigo scale
  indigo: {
    400: 'oklch(70% 0.18 270)',
    500: 'oklch(60% 0.2 270)',
    600: 'oklch(50% 0.18 270)',
  },
  // Cyan scale
  cyan: {
    400: 'oklch(80% 0.12 210)',
    500: 'oklch(75% 0.14 210)',
    600: 'oklch(65% 0.12 210)',
  },
} as const;

// Helper to mix colors in OKLCH
export function mixOklch(base: string, opacity: number): string {
  return `color-mix(in oklch, ${base} ${opacity * 100}%, transparent)`;
}

// Theme configurations
export const colorThemeConfigs: Record<ColorTheme, ColorThemeConfig> = {
  default: {
    name: 'Default',
    description: 'Neutral gray with subtle blue accent',
    colors: {
      light: {
        accent: OKLCH.blue[500],
        accentHover: OKLCH.blue[600],
        accentSubtle: mixOklch(OKLCH.blue[500], 0.1),
      },
      dark: {
        accent: OKLCH.blue[500],
        accentHover: OKLCH.blue[400],
        accentSubtle: mixOklch(OKLCH.blue[500], 0.15),
      },
    },
  },
  blue: {
    name: 'Ocean Blue',
    description: 'Deep blue accent theme',
    colors: {
      light: {
        accent: OKLCH.blue[500],
        accentHover: OKLCH.blue[600],
        accentSubtle: mixOklch(OKLCH.blue[500], 0.1),
        primary: OKLCH.blue[600],
        primaryHover: OKLCH.blue[600],
      },
      dark: {
        accent: OKLCH.blue[400],
        accentHover: OKLCH.blue[500],
        accentSubtle: mixOklch(OKLCH.blue[500], 0.15),
        primary: OKLCH.blue[400],
        primaryHover: OKLCH.blue[500],
      },
    },
  },
  green: {
    name: 'Forest Green',
    description: 'Natural green accent theme',
    colors: {
      light: {
        accent: OKLCH.green[500],
        accentHover: OKLCH.green[600],
        accentSubtle: mixOklch(OKLCH.green[500], 0.1),
      },
      dark: {
        accent: OKLCH.green[400],
        accentHover: OKLCH.green[500],
        accentSubtle: mixOklch(OKLCH.green[500], 0.15),
      },
    },
  },
  purple: {
    name: 'Royal Purple',
    description: 'Rich purple accent theme',
    colors: {
      light: {
        accent: OKLCH.purple[500],
        accentHover: OKLCH.purple[600],
        accentSubtle: mixOklch(OKLCH.purple[500], 0.1),
      },
      dark: {
        accent: OKLCH.purple[400],
        accentHover: OKLCH.purple[500],
        accentSubtle: mixOklch(OKLCH.purple[500], 0.15),
      },
    },
  },
  orange: {
    name: 'Sunset Orange',
    description: 'Warm orange accent theme',
    colors: {
      light: {
        accent: OKLCH.orange[500],
        accentHover: OKLCH.orange[600],
        accentSubtle: mixOklch(OKLCH.orange[500], 0.1),
      },
      dark: {
        accent: OKLCH.orange[400],
        accentHover: OKLCH.orange[500],
        accentSubtle: mixOklch(OKLCH.orange[500], 0.15),
      },
    },
  },
  rose: {
    name: 'Cherry Rose',
    description: 'Soft rose accent theme',
    colors: {
      light: {
        accent: OKLCH.rose[500],
        accentHover: OKLCH.rose[600],
        accentSubtle: mixOklch(OKLCH.rose[500], 0.1),
      },
      dark: {
        accent: OKLCH.rose[400],
        accentHover: OKLCH.rose[500],
        accentSubtle: mixOklch(OKLCH.rose[500], 0.15),
      },
    },
  },
  amber: {
    name: 'Amber Gold',
    description: 'Warm amber accent theme',
    colors: {
      light: {
        accent: OKLCH.amber[500],
        accentHover: OKLCH.amber[600],
        accentSubtle: mixOklch(OKLCH.amber[500], 0.1),
      },
      dark: {
        accent: OKLCH.amber[400],
        accentHover: OKLCH.amber[500],
        accentSubtle: mixOklch(OKLCH.amber[500], 0.15),
      },
    },
  },
  teal: {
    name: 'Ocean Teal',
    description: 'Refreshing teal accent theme',
    colors: {
      light: {
        accent: OKLCH.teal[500],
        accentHover: OKLCH.teal[600],
        accentSubtle: mixOklch(OKLCH.teal[500], 0.1),
      },
      dark: {
        accent: OKLCH.teal[400],
        accentHover: OKLCH.teal[500],
        accentSubtle: mixOklch(OKLCH.teal[500], 0.15),
      },
    },
  },
  indigo: {
    name: 'Deep Indigo',
    description: 'Rich indigo accent theme',
    colors: {
      light: {
        accent: OKLCH.indigo[500],
        accentHover: OKLCH.indigo[600],
        accentSubtle: mixOklch(OKLCH.indigo[500], 0.1),
      },
      dark: {
        accent: OKLCH.indigo[400],
        accentHover: OKLCH.indigo[500],
        accentSubtle: mixOklch(OKLCH.indigo[500], 0.15),
      },
    },
  },
  cyan: {
    name: 'Electric Cyan',
    description: 'Bright cyan accent theme',
    colors: {
      light: {
        accent: OKLCH.cyan[500],
        accentHover: OKLCH.cyan[600],
        accentSubtle: mixOklch(OKLCH.cyan[500], 0.1),
      },
      dark: {
        accent: OKLCH.cyan[400],
        accentHover: OKLCH.cyan[500],
        accentSubtle: mixOklch(OKLCH.cyan[500], 0.15),
      },
    },
  },
};

export const colorThemeNames: Record<ColorTheme, string> = {
  default: 'Default',
  blue: 'Ocean Blue',
  green: 'Forest Green',
  purple: 'Royal Purple',
  orange: 'Sunset Orange',
  rose: 'Cherry Rose',
  amber: 'Amber Gold',
  teal: 'Ocean Teal',
  indigo: 'Deep Indigo',
  cyan: 'Electric Cyan',
};

// OKLCH utility functions
export function hexToOklch(hex: string): string {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Convert to linear RGB
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Convert to XYZ (D65)
  const x = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const y = 0.2119034982 * lr + 0.6806995458 * lg + 0.1073969566 * lb;
  const z = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // Convert to OKLab
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  // Convert to OKLCH
  const C = Math.sqrt(a * a + b_ * b_);
  const H = C < 0.0001 ? 0 : ((Math.atan2(b_, a) * 180) / Math.PI + 360) % 360;

  return `oklch(${Math.round(L * 100)}% ${Math.round(C * 1000) / 1000} ${Math.round(H)})`;
}

/**
 * Get contrast ratio between two OKLCH colors
 * Uses simplified luminance calculation
 */
export function getOklchContrast(color1: string, color2: string): number {
  // Extract L values from OKLCH
  const l1Match = color1.match(/oklch\((\d+(?:\.\d+)?)%/);
  const l2Match = color2.match(/oklch\((\d+(?:\.\d+)?)%/);

  if (!l1Match || !l2Match) return 1;

  const l1 = parseFloat(l1Match[1]) / 100;
  const l2 = parseFloat(l2Match[1]) / 100;

  // Calculate contrast ratio
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Generate a color scale using OKLCH
 * Creates perceptually uniform steps
 */
export function generateOklchScale(
  baseHue: number,
  options: { chroma?: number; lightnessRange?: [number, number]; steps?: number } = {}
): string[] {
  const { chroma = 0.15, lightnessRange = [20, 95], steps = 10 } = options;

  const [minL, maxL] = lightnessRange;
  const step = (maxL - minL) / (steps - 1);

  return Array.from({ length: steps }, (_, i) => {
    const L = minL + step * i;
    return `oklch(${Math.round(L)}% ${chroma} ${baseHue})`;
  });
}
