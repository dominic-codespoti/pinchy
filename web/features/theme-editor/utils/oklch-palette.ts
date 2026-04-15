/**
 * OKLCH Color Palette - Canonical source for OKLCH color values
 * 
 * This file contains the single source of truth for OKLCH color scales
 * used throughout the theme system.
 * 
 * OKLCH provides:
 * - Perceptual uniformity (consistent perceived lightness)
 * - Better color harmony
 * - Predictable contrast ratios
 * - Wide gamut support
 */

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
