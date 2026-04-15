/**
 * Theme Editor feature types
 */

export type ColorTheme =
  | 'default'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'rose'
  | 'amber'
  | 'teal'
  | 'indigo'
  | 'cyan';

export interface ColorThemeColors {
  accent: string;
  accentHover: string;
  accentSubtle: string;
  primary?: string;
  primaryHover?: string;
  secondary?: string;
}

export interface ColorThemeConfig {
  name: string;
  description: string;
  colors: {
    light: ColorThemeColors;
    dark: ColorThemeColors;
  };
}

export interface OklchColor {
  l: number; // Lightness (0-100)
  c: number; // Chroma (0-0.4)
  h: number; // Hue (0-360)
}

export interface ThemeEditorState {
  selectedTheme: ColorTheme;
  customColors: Partial<ColorThemeColors>;
  isDark: boolean;
}
