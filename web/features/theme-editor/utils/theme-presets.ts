/**
 * Theme Presets for Pinchy
 * 
 * 16 curated themes with OKLCH colors
 * Each theme has light and dark variants
 */

export type ThemeVariant = 'light' | 'dark' | 'system';
export type ThemeCategory = 'professional' | 'vibrant' | 'minimal' | 'nature';

export interface ThemeColors {
  // Core
  background: string;
  foreground: string;
  'background-elevated': string;
  'background-sunken': string;
  surface: string;
  'surface-hover': string;
  'surface-active': string;
  
  // Primary
  primary: string;
  'primary-hover': string;
  'primary-foreground': string;
  
  // Secondary
  secondary: string;
  'secondary-hover': string;
  'secondary-foreground': string;
  
  // Accent
  accent: string;
  'accent-hover': string;
  'accent-foreground': string;
  'accent-subtle': string;
  
  // Text variations
  'foreground-muted': string;
  'foreground-subtle': string;
  
  // Border
  border: string;
  'border-subtle': string;
  
  // Status
  success: string;
  'success-subtle': string;
  warning: string;
  'warning-subtle': string;
  danger: string;
  'danger-subtle': string;
  info: string;
  'info-subtle': string;
  
  // Focus
  ring: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}

// OKLCH helpers
const oklch = (l: number, c: number, h: number) => `oklch(${l}% ${c.toFixed(3)} ${h})`;
const mix = (color: string, opacity: number) => `color-mix(in oklch, ${color} ${opacity}%, transparent)`;

// Base hues
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
  brown: 60,
};

// Generate theme from base parameters
function generateTheme(
  name: string,
  description: string,
  category: ThemeCategory,
  lightParams: { bg: number; primary: number; accent: number; hue: number },
  darkParams: { bg: number; primary: number; accent: number; hue: number }
): ThemePreset {
  const lh = lightParams.hue;
  const dh = darkParams.hue;
  
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description,
    category,
    colors: {
      light: {
        background: oklch(lightParams.bg, 0.005, HUES.gray),
        foreground: oklch(15, 0.02, HUES.gray),
        'background-elevated': oklch(Math.min(lightParams.bg + 3, 98), 0.01, HUES.gray),
        'background-sunken': oklch(Math.max(lightParams.bg - 3, 5), 0.005, HUES.gray),
        surface: oklch(Math.min(lightParams.bg + 2, 98), 0.01, HUES.gray),
        'surface-hover': oklch(Math.min(lightParams.bg + 5, 98), 0.015, HUES.gray),
        'surface-active': oklch(Math.min(lightParams.bg + 8, 98), 0.02, HUES.gray),
        
        primary: oklch(lightParams.primary, 0.18, lh),
        'primary-hover': oklch(Math.max(lightParams.primary - 8, 35), 0.16, lh),
        'primary-foreground': oklch(98, 0.01, HUES.gray),
        
        secondary: oklch(92, 0.01, HUES.gray),
        'secondary-hover': oklch(88, 0.015, HUES.gray),
        'secondary-foreground': oklch(30, 0.02, HUES.gray),
        
        accent: oklch(lightParams.accent, 0.2, lh),
        'accent-hover': oklch(Math.min(lightParams.accent + 5, 75), 0.18, lh),
        'accent-foreground': oklch(98, 0.01, HUES.gray),
        'accent-subtle': mix(oklch(lightParams.accent, 0.2, lh), 12),
        
        'foreground-muted': oklch(50, 0.03, HUES.gray),
        'foreground-subtle': oklch(65, 0.02, HUES.gray),
        
        border: oklch(85, 0.02, HUES.gray),
        'border-subtle': oklch(92, 0.01, HUES.gray),
        
        success: oklch(65, 0.18, HUES.green),
        'success-subtle': mix(oklch(65, 0.18, HUES.green), 12),
        warning: oklch(75, 0.15, HUES.amber),
        'warning-subtle': mix(oklch(75, 0.15, HUES.amber), 12),
        danger: oklch(55, 0.2, HUES.red),
        'danger-subtle': mix(oklch(55, 0.2, HUES.red), 12),
        info: oklch(70, 0.16, HUES.blue),
        'info-subtle': mix(oklch(70, 0.16, HUES.blue), 12),
        
        ring: oklch(lightParams.accent, 0.2, lh),
      },
      dark: {
        background: oklch(darkParams.bg, 0.02, HUES.gray),
        foreground: oklch(95, 0.01, HUES.gray),
        'background-elevated': oklch(Math.min(darkParams.bg + 5, 25), 0.025, HUES.gray),
        'background-sunken': oklch(Math.max(darkParams.bg - 3, 8), 0.015, HUES.gray),
        surface: oklch(Math.min(darkParams.bg + 5, 25), 0.025, HUES.gray),
        'surface-hover': oklch(Math.min(darkParams.bg + 8, 30), 0.03, HUES.gray),
        'surface-active': oklch(Math.min(darkParams.bg + 11, 35), 0.035, HUES.gray),
        
        primary: oklch(darkParams.primary, 0.2, dh),
        'primary-hover': oklch(Math.min(darkParams.primary + 8, 78), 0.18, dh),
        'primary-foreground': oklch(10, 0.02, HUES.gray),
        
        secondary: oklch(25, 0.02, HUES.gray),
        'secondary-hover': oklch(30, 0.025, HUES.gray),
        'secondary-foreground': oklch(90, 0.01, HUES.gray),
        
        accent: oklch(darkParams.accent, 0.22, dh),
        'accent-hover': oklch(Math.min(darkParams.accent + 6, 80), 0.2, dh),
        'accent-foreground': oklch(10, 0.02, HUES.gray),
        'accent-subtle': mix(oklch(darkParams.accent, 0.22, dh), 15),
        
        'foreground-muted': oklch(60, 0.02, HUES.gray),
        'foreground-subtle': oklch(45, 0.015, HUES.gray),
        
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
        
        ring: oklch(darkParams.accent, 0.22, dh),
      },
    },
  };
}

// All 16 themes
export const themePresets: ThemePreset[] = [
  // Professional
  generateTheme('Classic', 'Timeless gray with subtle blue accents', 'professional',
    { bg: 98, primary: 45, accent: 55, hue: HUES.blue },
    { bg: 15, primary: 68, accent: 72, hue: HUES.blue }
  ),
  generateTheme('Slate', 'Cool grays with blue undertones', 'professional',
    { bg: 97, primary: 50, accent: 60, hue: 260 },
    { bg: 15, primary: 70, accent: 75, hue: 260 }
  ),
  
  // Dark
  generateTheme('Midnight', 'Deep navy with warm accents', 'professional',
    { bg: 98, primary: 40, accent: 55, hue: HUES.indigo },
    { bg: 12, primary: 70, accent: 75, hue: HUES.indigo }
  ),
  
  // Nature
  generateTheme('Forest', 'Natural greens for a calm workspace', 'nature',
    { bg: 97, primary: 45, accent: 55, hue: HUES.green },
    { bg: 14, primary: 65, accent: 70, hue: HUES.green }
  ),
  generateTheme('Ocean', 'Deep blues inspired by the sea', 'nature',
    { bg: 98, primary: 55, accent: 60, hue: HUES.cyan },
    { bg: 13, primary: 65, accent: 72, hue: HUES.cyan }
  ),
  generateTheme('Mint', 'Fresh teal and mint greens', 'nature',
    { bg: 98, primary: 60, accent: 65, hue: HUES.teal },
    { bg: 14, primary: 70, accent: 75, hue: HUES.teal }
  ),
  generateTheme('Coffee', 'Warm browns for cozy focus', 'nature',
    { bg: 95, primary: 50, accent: 55, hue: HUES.brown },
    { bg: 16, primary: 65, accent: 70, hue: HUES.brown }
  ),
  
  // Vibrant
  generateTheme('Sunset', 'Warm oranges and pinks', 'vibrant',
    { bg: 97, primary: 60, accent: 60, hue: HUES.orange },
    { bg: 14, primary: 68, accent: 70, hue: HUES.orange }
  ),
  generateTheme('Berry', 'Rich purples and magentas', 'vibrant',
    { bg: 98, primary: 55, accent: 58, hue: HUES.purple },
    { bg: 13, primary: 68, accent: 72, hue: HUES.purple }
  ),
  generateTheme('Rose', 'Soft pinks with elegant warmth', 'vibrant',
    { bg: 98, primary: 55, accent: 60, hue: HUES.rose },
    { bg: 14, primary: 70, accent: 75, hue: HUES.rose }
  ),
  generateTheme('Cherry', 'Bold reds for high energy', 'vibrant',
    { bg: 98, primary: 55, accent: 58, hue: HUES.red },
    { bg: 13, primary: 65, accent: 70, hue: HUES.red }
  ),
  generateTheme('Gold', 'Luxurious amber and gold tones', 'vibrant',
    { bg: 97, primary: 70, accent: 75, hue: HUES.amber },
    { bg: 14, primary: 75, accent: 78, hue: HUES.amber }
  ),
  generateTheme('Coral', 'Warm coral and peach tones', 'vibrant',
    { bg: 97, primary: 65, accent: 60, hue: 30 },
    { bg: 14, primary: 72, accent: 70, hue: 30 }
  ),
  generateTheme('Lavender', 'Soft purples for creative flow', 'vibrant',
    { bg: 97, primary: 60, accent: 65, hue: 300 },
    { bg: 14, primary: 72, accent: 76, hue: 300 }
  ),
  
  // Minimal
  generateTheme('Monochrome', 'Pure grayscale elegance', 'minimal',
    { bg: 98, primary: 35, accent: 45, hue: HUES.gray },
    { bg: 12, primary: 75, accent: 80, hue: HUES.gray }
  ),
  generateTheme('Paper', 'Clean white, minimal distractions', 'minimal',
    { bg: 100, primary: 45, accent: 55, hue: HUES.blue },
    { bg: 18, primary: 70, accent: 75, hue: HUES.blue }
  ),
];

// Categories for UI
export const themeCategories = [
  { id: 'professional', name: 'Professional', description: 'Clean and polished for work' },
  { id: 'vibrant', name: 'Vibrant', description: 'Bold and expressive colors' },
  { id: 'nature', name: 'Nature', description: 'Organic and calming tones' },
  { id: 'minimal', name: 'Minimal', description: 'Distraction-free simplicity' },
] as const;

// Get theme by ID
export function getThemeById(id: string): ThemePreset | undefined {
  return themePresets.find(t => t.id === id);
}

// Get themes by category
export function getThemesByCategory(category: ThemeCategory) {
  return themePresets.filter(t => t.category === category);
}

// Apply theme colors to CSS variables
export function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement;
  
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  
  // shadcn/ui compatibility - must match tailwind.config.ts
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--foreground', colors.foreground);
  root.style.setProperty('--surface-default', colors.surface);
  root.style.setProperty('--surface-hover', colors['surface-hover']);
  root.style.setProperty('--surface-active', colors['surface-active']);
  root.style.setProperty('--background-elevated', colors['background-elevated']);
  root.style.setProperty('--background-sunken', colors['background-sunken']);
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
  root.style.setProperty('--border-default', colors.border);
  root.style.setProperty('--border-subtle', colors['border-subtle']);
  root.style.setProperty('--input', colors.border);
  root.style.setProperty('--ring', colors.ring);
  root.style.setProperty('--radius', '0.5rem');
  
  // Text colors
  root.style.setProperty('--text-default', colors.foreground);
  root.style.setProperty('--text-muted', colors['foreground-muted']);
  root.style.setProperty('--text-subtle', colors['foreground-subtle']);
  
  // Status colors
  root.style.setProperty('--success', colors.success);
  root.style.setProperty('--success-foreground', colors.foreground);
  root.style.setProperty('--warning', colors.warning);
  root.style.setProperty('--warning-foreground', colors.foreground);
  root.style.setProperty('--danger', colors.danger);
  root.style.setProperty('--danger-foreground', colors.foreground);
  root.style.setProperty('--info', colors.info);
  root.style.setProperty('--info-foreground', colors.foreground);
}

// Storage keys
export const THEME_STORAGE_KEY = 'pinchy-theme-v4';
export const THEME_VARIANT_KEY = 'pinchy-theme-variant-v2';
