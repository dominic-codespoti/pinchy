/**
 * Agent feature constants
 * Centralized constants to avoid duplication across agent-related components
 */

import { AgentGroup } from './types';

/**
 * Available group colors with their display labels
 * Used for group creation, editing, and display
 */
export const GROUP_COLORS: Array<{ value: AgentGroup['color']; label: string }> = [
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-green-500', label: 'Green' },
  { value: 'bg-purple-500', label: 'Purple' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-pink-500', label: 'Pink' },
  { value: 'bg-cyan-500', label: 'Cyan' },
  { value: 'bg-amber-500', label: 'Amber' },
  { value: 'bg-rose-500', label: 'Rose' },
  { value: 'bg-slate-500', label: 'Gray' },
];

/**
 * Default color values for agent groups
 * Used when assigning default colors or cycling through options
 */
export const DEFAULT_GROUP_COLOR_VALUES: AgentGroup['color'][] = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-rose-500',
];

/**
 * Memory category definitions with styling
 * Used in memory card and memory tab components
 */
export const MEMORY_CATEGORIES: Array<{ id: string; label: string; color: string }> = [
  { id: 'all', label: 'All', color: '' },
  { id: 'general', label: 'General', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { id: 'important', label: 'Important', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { id: 'todo', label: 'Todo', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { id: 'note', label: 'Note', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
];
