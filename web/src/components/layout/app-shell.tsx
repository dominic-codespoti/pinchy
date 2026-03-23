import { createSignal, For, Show, type JSX } from "solid-js";
import { useLocation } from "@solidjs/router";
import {
  Sparkles,
  LayoutDashboard,
  MessageSquare,
  Bot,
  History,
  Clock,
  Sparkles as SkillsIcon,
  Settings,
  ScrollText,
  Menu,
  X,
} from "@/components/icons";
import { ConnectionIndicator, ConnectionPill } from "@/components/connection-indicator";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { IconProps } from "@/components/icons";

// ── Navigation definition ────────────────────────────

interface NavItem {
  readonly label: string;
  readonly subtitle: string;
  readonly path: string;
  readonly icon: (p?: IconProps) => JSX.Element;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview",   subtitle: "Dashboard",   path: "/",         icon: LayoutDashboard },
  { label: "Chat",       subtitle: "Agent chat",  path: "/chat",     icon: MessageSquare },
  { label: "Agents",     subtitle: "Manage",      path: "/agents",   icon: Bot },
  { label: "Sessions",   subtitle: "History",     path: "/sessions", icon: History },
  { label: "Automation", subtitle: "Cron jobs",   path: "/cron",     icon: Clock },
  { label: "Skills",     subtitle: "Registry",    path: "/skills",   icon: SkillsIcon },
  { label: "Config",     subtitle: "Settings",    path: "/config",   icon: Settings },
  { label: "Logs",       subtitle: "Live tail",   path: "/logs",     icon: ScrollText },
];

// First 4 items shown in mobile bottom tab bar
const MOBILE_TAB_ITEMS = NAV_ITEMS.slice(0, 4);

// ── NavButton ────────────────────────────────────────

function NavButton(props: {
  item: NavItem;
  compact?: boolean;
  onClick?: () => void;
}) {
  const location = useLocation();

  const isActive = () => {
    const path = location.pathname;
    if (props.item.path === "/") return path === "/";
    return path === props.item.path || path.startsWith(props.item.path + "/");
  };

  return (
    <a
      href={`#${props.item.path}`}
      class={props.compact ? "nav-tab" : "nav-link"}
      classList={{ active: isActive() }}
      onClick={props.onClick}
    >
      {props.item.icon({ size: props.compact ? 18 : 16 })}
      <span class={props.compact ? "nav-tab-label" : "nav-link-label"}>
        {props.item.label}
      </span>
    </a>
  );
}

// ── AppShell ─────────────────────────────────────────

export function AppShell(props: { children: JSX.Element }) {
  const [mobileOpen, setMobileOpen] = createSignal(false);

  return (
    <div class="app-shell">
      {/* ── Desktop sidebar ── */}
      <aside class="sidebar">
        <div class="sidebar-header">
          <Sparkles size={18} />
          <div class="sidebar-brand">
            <span class="sidebar-title">Pinchy</span>
            <span class="sidebar-subtitle">Ops console</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          <For each={NAV_ITEMS}>
            {(item) => <NavButton item={item} />}
          </For>
        </nav>

        <div class="sidebar-footer">
          <ConnectionIndicator />
          <ThemeSwitcher />
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header class="mobile-bar">
        <button
          class="btn btn-ghost btn-icon"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <Show when={mobileOpen()} fallback={<Menu size={20} />}>
            <X size={20} />
          </Show>
        </button>
        <span class="mobile-title">Pinchy</span>
        <ConnectionPill />
      </header>

      {/* ── Mobile dropdown nav ── */}
      <Show when={mobileOpen()}>
        <div class="mobile-dropdown">
          <nav class="mobile-dropdown-nav">
            <For each={NAV_ITEMS}>
              {(item) => (
                <NavButton
                  item={item}
                  onClick={() => setMobileOpen(false)}
                />
              )}
            </For>
          </nav>
          <div class="mobile-dropdown-footer">
            <ThemeSwitcher />
          </div>
        </div>
      </Show>

      {/* ── Main content ── */}
      <main class="main-content">
        {props.children}
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav class="mobile-tabs">
        <For each={MOBILE_TAB_ITEMS}>
          {(item) => <NavButton item={item} compact />}
        </For>
      </nav>
    </div>
  );
}
