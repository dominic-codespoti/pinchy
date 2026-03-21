import { useCallback, useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { useTheme, type ThemeId } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

// ── ThemeSwitcher ────────────────────────────────────
// A compact button that opens a floating panel of theme swatches.
// Designed to sit in the narrow w-14 sidebar.

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const selectTheme = useCallback(
    (id: ThemeId) => {
      setTheme(id);
      setOpen(false);
    },
    [setTheme],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
          open
            ? "bg-accent-muted text-accent shadow-glow"
            : "text-text-3 hover:bg-[var(--color-elevated)] hover:text-text-2",
        )}
        title="Switch theme"
        aria-label="Switch theme"
        aria-expanded={open}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <ThemePanel
          ref={panelRef}
          currentTheme={theme}
          themes={themes}
          onSelect={selectTheme}
        />
      )}
    </div>
  );
}

// ── ThemePanel ────────────────────────────────────────

interface ThemePanelProps {
  readonly currentTheme: ThemeId;
  readonly themes: ReadonlyArray<{
    readonly id: ThemeId;
    readonly label: string;
    readonly accent: string;
  }>;
  readonly onSelect: (id: ThemeId) => void;
}

import { forwardRef } from "react";

const ThemePanel = forwardRef<HTMLDivElement, ThemePanelProps>(
  function ThemePanel({ currentTheme, themes, onSelect }, ref) {
    return (
      <div
        ref={ref}
        role="listbox"
        aria-label="Theme selection"
        className={cn(
          "absolute bottom-0 left-[calc(100%+8px)]",
          "z-50 w-44 rounded-lg border border-border bg-surface-1 p-1.5",
          "shadow-dropdown",
          "animate-in fade-in slide-in-from-left-2 duration-150",
        )}
      >
        <div className="mb-1.5 px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-text-3">
          Theme
        </div>
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={t.id === currentTheme}
            onClick={() => {
              onSelect(t.id);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
              t.id === currentTheme
                ? "bg-accent-subtle text-accent"
                : "text-text-2 hover:bg-[var(--color-elevated)] hover:text-text-1",
            )}
          >
            <span
              className={cn(
                "h-3.5 w-3.5 shrink-0 rounded-full border",
                t.id === currentTheme
                  ? "border-accent shadow-glow"
                  : "border-border-strong",
              )}
              style={{ backgroundColor: t.accent }}
              aria-hidden="true"
            />
            <span className="truncate">{t.label}</span>
            {t.id === currentTheme && (
              <span className="ml-auto text-[10px] text-accent opacity-60">
                &#10003;
              </span>
            )}
          </button>
        ))}
      </div>
    );
  },
);
