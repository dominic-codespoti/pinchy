export interface FormatRelativeTimeOptions {
  capitalize?: boolean;
}

export function formatRelativeTime(
  date: Date | string | number,
  options?: FormatRelativeTimeOptions
): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const justNow = options?.capitalize ? 'Just now' : 'just now';

  if (diffSecs < 60) return justNow;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return dateObj.toLocaleDateString();
}

// Backward-compatible alias
export function getRelativeTime(date: Date | string | number): string {
  return formatRelativeTime(date);
}
