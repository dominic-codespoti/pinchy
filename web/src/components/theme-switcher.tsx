import { createSignal, For, Show, onCleanup } from "solid-js";
import { themeStore } from "@/theme";
import { Palette } from "@/components/icons";

export function ThemeSwitcher() {
  const [open, setOpen] = createSignal(false);
  let triggerRef: HTMLButtonElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  function handleClickOutside(e: MouseEvent) {
    if (
      triggerRef && !triggerRef.contains(e.target as Node) &&
      panelRef && !panelRef.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  // Attach/detach listeners when open
  function attachListeners() {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  }

  function detachListeners() {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  }

  onCleanup(detachListeners);

  function toggle() {
    const next = !open();
    setOpen(next);
    if (next) attachListeners();
    else detachListeners();
  }

  return (
    <div class="theme-switcher">
      <button
        ref={triggerRef}
        class="btn btn-ghost btn-icon theme-trigger"
        onClick={toggle}
        title="Change theme"
        aria-label="Change theme"
        aria-expanded={open()}
      >
        <Palette size={16} />
      </button>

      <Show when={open()}>
        <div ref={panelRef} class="theme-panel">
          <For each={themeStore.themes}>
            {(t) => (
              <button
                class="theme-option"
                classList={{ "theme-option-active": themeStore.theme() === t.id }}
                onClick={() => {
                  themeStore.setTheme(t.id);
                  setOpen(false);
                  detachListeners();
                }}
              >
                <span
                  class="theme-swatch"
                  style={{ background: t.swatch }}
                />
                <span class="theme-label">{t.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
