import { createSignal, For, Show, onCleanup } from "solid-js";

// ── Types ────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly message: string;
  readonly removing: boolean;
}

// ── Global state ─────────────────────────────────────

let nextId = 0;
const [toasts, setToasts] = createSignal<Toast[]>([]);
const timers = new Map<number, number>();

const TOAST_DURATION = 4000;
const TOAST_EXIT_MS = 200;
const MAX_TOASTS = 5;

function scheduleRemoval(id: number) {
  const timer = window.setTimeout(() => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
    // Remove after animation
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.delete(id);
    }, TOAST_EXIT_MS);
  }, TOAST_DURATION);
  timers.set(id, timer);
}

function addToast(type: ToastType, message: string) {
  const id = nextId++;
  setToasts((prev) => {
    const next = [...prev, { id, type, message, removing: false }];
    // Cap at max
    if (next.length > MAX_TOASTS) {
      const removed = next[0]!;
      window.clearTimeout(timers.get(removed.id));
      timers.delete(removed.id);
      return next.slice(1);
    }
    return next;
  });
  scheduleRemoval(id);
}

function dismissToast(id: number) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
  window.setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, TOAST_EXIT_MS);
}

// ── Public API ───────────────────────────────────────

export const toast = {
  success: (message: string) => addToast("success", message),
  error: (message: string) => addToast("error", message),
  info: (message: string) => addToast("info", message),
};

// ── Component ────────────────────────────────────────

export function Toaster() {
  onCleanup(() => {
    for (const timer of timers.values()) {
      window.clearTimeout(timer);
    }
    timers.clear();
  });

  return (
    <Show when={toasts().length > 0}>
      <div class="toast-container">
        <For each={toasts()}>
          {(t) => (
            <div
              class={`toast toast-${t.type} ${t.removing ? "toast-exit" : "toast-enter"}`}
              onClick={() => dismissToast(t.id)}
            >
              <span class="toast-icon">
                {t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : "\u2139"}
              </span>
              <span class="toast-message">{t.message}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
