/**
 * Professional Theme System for Pinchy
 * 
 * Inspired by modern AI agent UIs (Claude, ChatGPT, Cursor)
 * Features:
 * - Full background theming (not just accents)
 * - 20+ carefully curated themes
 * - Light/Dark/System variants for each theme
 * - Consistent color harmony using OKLCH
 */

export type ThemeVariant = 'light' | 'dark' | 'system';

export interface ThemeColors {
  // Core backgrounds
  background: string;
  'background-elevated': string;
  'background-sunken': string;
  
  // Surfaces (cards, panels)
  surface: string;
  'surface-hover': string;
  'surface-active': string;
  
  // Text
  foreground: string;
  'foreground-muted': string;
  'foreground-subtle': string;
  
  // Primary brand (CTAs, primary buttons)
  primary: string;
  'primary-hover': string;
  'primary-foreground': string;
  
  // Secondary (secondary buttons, chips)
  secondary: string;
  'secondary-hover': string;
  'secondary-foreground': string;
  
  // Accent (highlights, active states, links)
  accent: string;
  'accent-hover': string;
  'accent-foreground': string;
  'accent-subtle': string;
  
  // Border
  border: string;
  'border-subtle': string;
  
  // Status colors
  success: string;
  'success-subtle': string;
  warning: string;
  'warning-subtle': string;
  danger: string;
  'danger-subtle': string;
  info: string;
  'info-subtle': string;
  
  // Ring/focus
  ring: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  category: 'professional' | 'vibrant' | 'minimal' | 'nature' | 'dark';
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

// OKLCH Color helpers
const l = (lightness: number) => `${lightness}%`;
const c = (chroma: number) => chroma.toFixed(3);
const h = (hue: number) => hue;
const oklch = (l: number, c: number, h: number) => `oklch(${l}% ${c.toFixed(3)} ${h})`;
const mix = (color: string, opacity: number) => `color-mix(in oklch, ${color} ${opacity}%, transparent)`;

// Base hue constants
const HUES = {
  gray: 280,
  red: 25,
  orange: 55,
  amber: 80,
  yellow: 95,
  lime: 125,
  green: 145,
  teal: 175,
  cyan: 200,
  blue: 250,
  indigo: 270,
  purple: 290,
  pink: 340,
  rose: 10,
};

// Generate a complete theme from base colors
function generateTheme(
  name: string,
  description: string,
  category: ThemePreset['category'],
  lightBase: { bg: number; fg: number; primary: number; accent: number; hue: number },
  darkBase: { bg: number; fg: number; primary: number; accent: number; hue: number }
): ThemePreset {
  const lightHue = lightBase.hue;
  const darkHue = darkBase.hue;
  
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description,
    category,
    colors: {
      light: {
        background: oklch(lightBase.bg, 0.005, HUES.gray),
        'background-elevated': oklch(Math.min(lightBase.bg + 3, 98), 0.01, HUES.gray),
        'background-sunken': oklch(Math.max(lightBase.bg - 3, 5), 0.005, HUES.gray),
        
        surface: oklch(lightBase.bg + 2, 0.01, HUES.gray),
        'surface-hover': oklch(lightBase.bg + 5, 0.015, HUES.gray),
        'surface-active': oklch(lightBase.bg + 8, 0.02, HUES.gray),
        
        foreground: oklch(lightBase.fg, 0.02, HUES.gray),
        'foreground-muted': oklch(50, 0.03, HUES.gray),
        'foreground-subtle': oklch(65, 0.02, HUES.gray),
        
        primary: oklch(lightBase.primary, 0.18, lightHue),
        'primary-hover': oklch(Math.max(lightBase.primary - 10, 40), 0.16, lightHue),
        'primary-foreground': oklch(98, 0.01, HUES.gray),
        
        secondary: oklch(92, 0.01, HUES.gray),
        'secondary-hover': oklch(88, 0.015, HUES.gray),
        'secondary-foreground': oklch(30, 0.02, HUES.gray),
        
        accent: oklch(lightBase.accent, 0.2, lightHue),
        'accent-hover': oklch(Math.min(lightBase.accent + 5, 75), 0.18, lightHue),
        'accent-foreground': oklch(98, 0.01, HUES.gray),
        'accent-subtle': mix(oklch(lightBase.accent, 0.2, lightHue), 10),
        
        border: oklch(85, 0.02, HUES.gray),
        'border-subtle': oklch(92, 0.01, HUES.gray),
        
        success: oklch(65, 0.18, HUES.green),
        'success-subtle': mix(oklch(65, 0.18, HUES.green), 10),
        warning: oklch(75, 0.15, HUES.amber),
        'warning-subtle': mix(oklch(75, 0.15, HUES.amber), 10),
        danger: oklch(55, 0.2, HUES.red),
        'danger-subtle': mix(oklch(55, 0.2, HUES.red), 10),
        info: oklch(70, 0.16, HUES.blue),
        'info-subtle': mix(oklch(70, 0.16, HUES.blue), 10),
        
        ring: oklch(lightBase.accent, 0.2, lightHue),
      },
      dark: {
        background: oklch(darkBase.bg, 0.02, HUES.gray),
        'background-elevated': oklch(Math.min(darkBase.bg + 5, 25), 0.025, HUES.gray),
        'background-sunken': oklch(Math.max(darkBase.bg - 3, 8), 0.015, HUES.gray),
        
        surface: oklch(Math.min(darkBase.bg + 3, 30), 0.02, HUES.gray),
        'surface-hover': oklch(Math.min(darkBase.bg + 6, 35), 0.025, HUES.gray),
        'surface-active': oklch(Math.min(darkBase.bg + 9, 40), 0.03, HUES.gray),
        
        foreground: oklch(darkBase.fg, 0.01, HUES.gray),
        'foreground-muted': oklch(60, 0.02, HUES.gray),
        'foreground-subtle': oklch(45, 0.015, HUES.gray),
        
        primary: oklch(darkBase.primary, 0.2, darkHue),
        'primary-hover': oklch(Math.min(darkBase.primary + 10, 75), 0.18, darkHue),
        'primary-foreground': oklch(10, 0.02, HUES.gray),
        
        secondary: oklch(25, 0.02, HUES.gray),
        'secondary-hover': oklch(30, 0.025, HUES.gray),
        'secondary-foreground': oklch(90, 0.01, HUES.gray),
        
        accent: oklch(darkBase.accent, 0.22, darkHue),
        'accent-hover': oklch(Math.min(darkBase.accent + 8, 78), 0.2, darkHue),
        'accent-foreground': oklch(10, 0.02, HUES.gray),
        'accent-subtle': mix(oklch(darkBase.accent, 0.22, darkHue), 15),
        
        border: oklch(30, 0.025, HUES.gray),
        'border-subtle': oklch(22, 0.02, HUES.gray),
        
        success: oklch(65, 0.2, HUES.green),
        'success-subtle': mix(oklch(65, 0.2, HUES.green), 15),
        warning: oklch(75, 0.18, HUES.amber),
        'warning-subtle': mix(oklch(75, 0.18, HUES.amber), 15),
        danger: oklch(60, 0.22, HUES.red),
        'danger-subtle': mix(oklch(60, 0.22, HUES.red), 15),
        info: oklch(70, 0.2, HUES.blue),
        'info-subtle': mix(oklch(70, 0.2, HUES.blue), 15),
        
        ring: oklch(darkBase.accent, 0.22, darkHue),
      },
    },
  };
}

// Professional Themes
export const themePresets: ThemePreset[] = [
  // Classic
  generateTheme(
    'Classic',
    'Timeless gray with subtle blue accents',
    'professional',
    { bg: 98, fg: 15, primary: 45, accent: 55, hue: HUES.blue },
    { bg: 15, fg: 95, primary: 65, accent: 70, hue: HUES.blue }
  ),
  
  // Midnight (like Claude)
  generateTheme(
    'Midnight',
    'Deep navy with warm accents',
    'dark',
    { bg: 98, fg: 12, primary: 40, accent: 55, hue: HUES.indigo },
    { bg: 12, fg: 95, primary: 70, accent: 75, hue: HUES.indigo }
  ),
  
  // Forest
  generateTheme(
    'Forest',
    'Natural greens for a calm workspace',
    'nature',
    { bg: 97, fg: 15, primary: 45, accent: 55, hue: HUES.green },
    { bg: 14, fg: 95, primary: 65, accent: 70, hue: HUES.green }
  ),
  
  // Ocean
  generateTheme(
    'Ocean',
    'Deep blues inspired by the sea',
    'nature',
    { bg: 98, fg: 12, primary: 55, accent: 60, hue: HUES.cyan },
    { bg: 13, fg: 95, primary: 65, accent: 72, hue: HUES.cyan }
  ),
  
  // Sunset
  generateTheme(
    'Sunset',
    'Warm oranges and pinks',
    'vibrant',
    { bg: 97, fg: 15, primary: 60, accent: 60, hue: HUES.orange },
    { bg: 14, fg: 95, primary: 68, accent: 70, hue: HUES.orange }
  ),
  
  // Berry
  generateTheme(
    'Berry',
    'Rich purples and magentas',
    'vibrant',
    { bg: 98, fg: 12, primary: 55, accent: 58, hue: HUES.purple },
    { bg: 13, fg: 95, primary: 68, accent: 72, hue: HUES.purple }
  ),
  
  // Rose
  generateTheme(
    'Rose',
    'Soft pinks with elegant warmth',
    'vibrant',
    { bg: 98, fg: 15, primary: 55, accent: 60, hue: HUES.rose },
    { bg: 14, fg: 95, primary: 70, accent: 75, hue: HUES.rose }
  ),
  
  // Monochrome
  generateTheme(
    'Monochrome',
    'Pure grayscale elegance',
    'minimal',
    { bg: 98, fg: 10, primary: 35, accent: 45, hue: HUES.gray },
    { bg: 12, fg: 95, primary: 75, accent: 80, hue: HUES.gray }
  ),
  
  // Coffee
  generateTheme(
    'Coffee',
    'Warm browns for cozy focus',
    'nature',
    { bg: 95, fg: 18, primary: 50, accent: 55, hue: 60 }, // brown-ish
    { bg: 16, fg: 92, primary: 65, accent: 70, hue: 60 }
  ),
  
  // Mint
  generateTheme(
    'Mint',
    'Fresh teal and mint greens',
    'nature',
    { bg: 98, fg: 15, primary: 60, accent: 65, hue: HUES.teal },
    { bg: 14, fg: 95, primary: 70, accent: 75, hue: HUES.teal }
  ),
  
  // Lavender
  generateTheme(
    'Lavender',
    'Soft purples for creative flow',
    'vibrant',
    { bg: 97, fg: 15, primary: 60, accent: 65, hue: 300 },
    { bg: 14, fg: 95, primary: 72, accent: 76, hue: 300 }
  ),
  
  // Cherry
  generateTheme(
    'Cherry',
    'Bold reds for high energy',
    'vibrant',
    { bg: 98, fg: 12, primary: 55, accent: 58, hue: HUES.red },
    { bg: 13, fg: 95, primary: 65, accent: 70, hue: HUES.red }
  ),
  
  // Slate
  generateTheme(
    'Slate',
    'Cool grays with blue undertones',
    'professional',
    { bg: 97, fg: 15, primary: 50, accent: 60, hue: 260 },
    { bg: 15, fg: 95, primary: 70, accent: 75, hue: 260 }
  ),
  
  // Gold
  generateTheme(
    'Gold',
    'Luxurious amber and gold tones',
    'vibrant',
    { bg: 97, fg: 15, primary: 70, accent: 75, hue: HUES.amber },
    { bg: 14, fg: 95, primary: 75, accent: 78, hue: HUES.amber }
  ),
  
  // Lime
  generateTheme(
    'Lime',
    'Energetic yellow-green freshness',
    'nature',
    { bg: 98, fg: 12, primary: 70, accent: 75, hue: HUES.lime },
    { bg: 13, fg: 95, primary: 78, accent: 80, hue: HUES.lime }
  ),
  
  // Coral
  generateTheme(
    'Coral',
    'Warm coral and peach tones',
    'vibrant',
    { bg: 97, fg: 15, primary: 65, accent: 60, hue: 30 },
    { bg: 14, fg: 95, primary: 72, accent: 70, hue: 30 }
  ),
  
  // Deep Space
  generateTheme(
    'Deep Space',
    'Ultra-dark for late night coding',
    'dark',
    { bg: 98, fg: 10, primary: 60, accent: 70, hue: HUES.purple },
    { bg: 8, fg: 90, primary: 70, accent: 78, hue: HUES.purple }
  ),
  
  // Paper
  generateTheme(
    'Paper',
    'Clean white, minimal distractions',
    'minimal',
    { bg: 100, fg: 15, primary: 45, accent: 55, hue: HUES.blue },
    { bg: 18, fg: 95, primary: 70, accent: 75, hue: HUES.blue }
  ),
];

// Theme categories for UI organization
export const themeCategories = [
  { id: 'professional', name: 'Professional', description: 'Clean and polished for work' },
  { id: 'vibrant', name: 'Vibrant', description: 'Bold and expressive colors' },
  { id: 'minimal', name: 'Minimal', description: 'Distraction-free simplicity' },
  { id: 'nature', name: 'Nature', description: 'Organic and calming tones' },
  { id: 'dark', name: 'Dark', description: 'Optimized for low-light' },
] as const;

// Apply theme colors to CSS variables
export function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement;
  
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  
  // Also set shadcn/ui compatibility variables
  root.style.setProperty('--card', colors.surface);
  root.style.setProperty('--card-foreground', colors.foreground);
  root.style.setProperty('--popover', colors['background-elevated']);
  root.style.setProperty('--popover-foreground', colors.foreground);
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-foreground', colors['primary-foreground']);
  root.style.setProperty('--secondary', colors.secondary);
  root.style.setProperty('--secondary-foreground', colors['secondary-foreground']);
  root.style.setProperty('--muted', colors['foreground-subtle']);
  root.style.setProperty('--muted-foreground', colors['foreground-muted']);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-foreground', colors['accent-foreground']);
  root.style.setProperty('--destructive', colors.danger);
  root.style.setProperty('--destructive-foreground', colors.foreground);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--input', colors.border);
  root.style.setProperty('--ring', colors.ring);
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--foreground', colors.foreground);
}

// Get theme by ID
export function getThemeById(id: string): ThemePreset | undefined {
  return themePresets.find(t => t.id === id);
}

// Get themes by category
export function getThemesByCategory(category: ThemePreset['category']) {
  return themePresets.filter(t => t.category === category);
}
