import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateMessages(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / 400));
}

export function formatRelativeTime(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString();
}

export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

export const CRON_RE = /^(@(annually|yearly|monthly|weekly|daily|midnight|hourly|reboot|every\s+\S+))$|^(\S+\s+){4,6}\S+$/i;

export function computeNextFires(expr: string, count: number): Date[] {
  if (!expr || !CRON_RE.test(expr)) return [];
  if (expr.startsWith("@")) return [];
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return [];
  const m = parts[0] === "*" ? null : parseInt(parts[0], 10);
  const h = parts[1] === "*" ? null : parseInt(parts[1], 10);
  if ((m !== null && Number.isNaN(m)) || (h !== null && Number.isNaN(h))) return [];
  const results: Date[] = [];
  let cursor = new Date();
  cursor.setSeconds(0, 0);
  for (let tries = 0; tries < 1440 * 7 && results.length < count; tries += 1) {
    cursor = new Date(cursor.getTime() + 60_000);
    if ((m === null || cursor.getMinutes() === m) && (h === null || cursor.getHours() === h)) {
      results.push(new Date(cursor));
    }
  }
  return results;
}

