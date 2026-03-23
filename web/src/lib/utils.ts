// ── Formatting helpers ───────────────────────────────

/** Format bytes into human-readable string */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rough estimate of message count from byte size */
export function estimateMessages(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / 400));
}

/** Format a timestamp (unix seconds or ms) to locale time string */
export function formatTimestamp(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString();
}

function toDate(value: number | string | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(value > 1e12 ? value : value * 1000);
  }
  return new Date(value);
}

/** Format a timestamp to a readable date + time string */
export function formatDateTime(value: number | string | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format a timestamp relative to now */
export function formatRelativeTime(
  value: number | string | Date | null | undefined,
): string {
  if (value == null) return "-";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMs = date.getTime() - Date.now();
  const diffAbs = Math.abs(diffMs);
  const minutes = Math.round(diffAbs / 60_000);

  if (minutes < 1) return diffMs >= 0 ? "in a moment" : "just now";
  if (minutes < 60)
    return `${diffMs >= 0 ? "in " : ""}${minutes}m${diffMs < 0 ? " ago" : ""}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return `${diffMs >= 0 ? "in " : ""}${hours}h${diffMs < 0 ? " ago" : ""}`;

  const days = Math.round(hours / 24);
  if (days < 7)
    return `${diffMs >= 0 ? "in " : ""}${days}d${diffMs < 0 ? " ago" : ""}`;

  return formatDateTime(date);
}

/** Truncate a long identifier in the middle */
export function truncateMiddle(
  value: string,
  start = 10,
  end = 6,
): string {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

/** Coerce an unknown value to displayable text */
export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ── Cron helpers ─────────────────────────────────────

/** Regex to validate cron expressions */
export const CRON_RE =
  /^(@(annually|yearly|monthly|weekly|daily|midnight|hourly|reboot|every\s+\S+))$|^(\S+\s+){4,6}\S+$/i;

/** Compute next N fire times for a simple cron expression */
export function computeNextFires(
  expr: string,
  count: number,
  tz?: string | null,
): ReadonlyArray<Date> {
  if (!expr || !CRON_RE.test(expr)) return [];
  if (expr.startsWith("@")) return [];
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return [];

  const rawMin = parts[0];
  const rawHour = parts[1];
  if (rawMin === undefined || rawHour === undefined) return [];

  const m = rawMin === "*" ? null : parseInt(rawMin, 10);
  const h = rawHour === "*" ? null : parseInt(rawHour, 10);
  if ((m !== null && Number.isNaN(m)) || (h !== null && Number.isNaN(h)))
    return [];

  const results: Date[] = [];
  let cursor = new Date();
  cursor.setSeconds(0, 0);

  for (let tries = 0; tries < 1440 * 7 && results.length < count; tries++) {
    cursor = new Date(cursor.getTime() + 60_000);
    const tzMinutes =
      tz != null ? getMinutesInTz(cursor, tz) : cursor.getMinutes();
    const tzHours =
      tz != null ? getHoursInTz(cursor, tz) : cursor.getHours();
    if ((m === null || tzMinutes === m) && (h === null || tzHours === h)) {
      results.push(new Date(cursor));
    }
  }
  return results;
}

function getMinutesInTz(date: Date, tz: string): number {
  const s = date.toLocaleString("en-US", {
    timeZone: tz,
    minute: "numeric",
  });
  return parseInt(s, 10);
}

function getHoursInTz(date: Date, tz: string): number {
  const s = date.toLocaleString("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(s, 10) % 24;
}

/** Format a Date in a given timezone */
export function formatInTz(date: Date, tz?: string | null): string {
  if (tz == null) return date.toLocaleString();
  return date.toLocaleString("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

// ── WebSocket URL ────────────────────────────────────

/** Build a WebSocket URL from a path */
export function wsUrl(path = "/ws"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

// ── Type guards ──────────────────────────────────────

/** Type guard: is value a plain key-value object? */
export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Coerce a string form value to its appropriate config type */
export function coerceConfigValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (v.length > 0 && Number.isFinite(n)) return n;
  return v;
}
