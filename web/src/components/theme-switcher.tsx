import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { useTheme, type ThemeId } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((p) => !p), []);

  const select = useCallback(
    (id: ThemeId) => {
      setTheme(id);
      setOpen(false);
    },
    [setTheme],
  );

  // Dismiss on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          open
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        title="Switch theme"
        aria-label="Switch theme"
        aria-expanded={open}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Theme selection"
          className={cn(
            "absolute bottom-0 left-[calc(100%+8px)]",
            "z-50 w-40 rounded-lg border border-border bg-popover p-1",
            "shadow-md",
            "animate-in fade-in slide-in-from-left-2 duration-150",
          )}
        >
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Theme
          </div>
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === theme}
              onClick={() => select(t.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                t.id === theme
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: t.swatch }}
                aria-hidden="true"
              />
              <span className="truncate text-xs">{t.label}</span>
              {t.id === theme && (
                <Check className="ml-auto h-3 w-3 shrink-0 opacity-60" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
