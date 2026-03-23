import { createSignal, createMemo, Show, For, onMount, onCleanup } from "solid-js";
import { ScrollText, Search, Trash2, Play, Pause, ArrowDown } from "@/components/icons";
import { PageShell, PageTitle } from "@/components/layout";
import { createLogStream, type LogLine } from "@/api/log-stream";

// ── Main Component ───────────────────────────────────

export default function Logs() {
  const { lines, paused, connect, disconnect, togglePause, clear } = createLogStream();
  const [search, setSearch] = createSignal("");
  const [autoScroll, setAutoScroll] = createSignal(true);
  let outputRef: HTMLDivElement | undefined;

  // Connect on mount, disconnect on cleanup
  onMount(() => connect());
  onCleanup(() => disconnect());

  // Auto-scroll when new lines arrive
  const filteredLines = createMemo(() => {
    const q = search().toLowerCase().trim();
    if (!q) return lines();
    return lines().filter(
      (l) => l.message.toLowerCase().includes(q) || l.timestamp.toLowerCase().includes(q),
    );
  });

  // Auto-scroll effect
  const scrollToBottom = () => {
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight;
    }
  };

  // Watch for new lines and auto-scroll
  // Use a memo to track line count and trigger scroll
  const lineCount = createMemo(() => filteredLines().length);
  // We use a reactive approach: read lineCount in the JSX via a hidden element
  // that triggers scroll. But simpler: just scroll in requestAnimationFrame.

  const [showJumpFab, setShowJumpFab] = createSignal(false);

  function handleScroll() {
    if (!outputRef) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(atBottom);
    setShowJumpFab(!atBottom && filteredLines().length > 0);
  }

  // Schedule scroll after render when auto-scroll is on
  function maybeScroll() {
    if (autoScroll()) {
      requestAnimationFrame(scrollToBottom);
    }
  }

  return (
    <PageShell
      maxWidth="full"
      header={
        <PageTitle icon={<ScrollText size={14} />} title="Logs">
          {/* Live/Paused badge */}
          <span class={`log-status-badge ${paused() ? "log-status-paused" : "log-status-live"}`}>
            {paused() ? "Paused" : "Live"}
          </span>

          <div class="separator-vertical" style={{ height: "20px" }} />

          {/* Controls */}
          <button
            class="btn btn-ghost btn-sm"
            onClick={togglePause}
            title={paused() ? "Resume" : "Pause"}
          >
            <Show when={paused()} fallback={<Pause size={14} />}>
              <Play size={14} />
            </Show>
            {paused() ? "Resume" : "Pause"}
          </button>

          <button
            class={`btn btn-sm ${autoScroll() ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => {
              const next = !autoScroll();
              setAutoScroll(next);
              if (next) requestAnimationFrame(scrollToBottom);
            }}
            title={autoScroll() ? "Disable auto-scroll" : "Enable auto-scroll"}
          >
            <ArrowDown size={14} />
            Auto-scroll
          </button>

          <button
            class="btn btn-ghost btn-sm"
            onClick={clear}
            title="Clear logs"
          >
            <Trash2 size={14} />
            Clear
          </button>

          <div class="separator-vertical" style={{ height: "20px" }} />

          {/* Search */}
          <div class="log-search-container">
            <Search size={12} style={{ color: "var(--muted-foreground)", "flex-shrink": "0" }} />
            <input
              class="log-search-input"
              type="text"
              placeholder="Filter..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <Show when={search()}>
              <button
                class="log-search-clear"
                onClick={() => setSearch("")}
                title="Clear filter"
              >
                <span style={{ "font-size": "10px", color: "var(--muted-foreground)", "font-variant-numeric": "tabular-nums" }}>
                  {filteredLines().length}/{lines().length}
                </span>
              </button>
            </Show>
          </div>
        </PageTitle>
      }
    >
      <div class="route-enter log-container">
        {/* Empty state */}
        <Show when={lines().length === 0 && !paused()}>
          <div class="log-empty">
            <ScrollText size={24} style={{ color: "var(--muted-foreground)" }} />
            <p style={{ color: "var(--muted-foreground)", "font-size": "var(--text-sm)" }}>
              Waiting for log output...
            </p>
          </div>
        </Show>

        <Show when={lines().length === 0 && paused()}>
          <div class="log-empty">
            <Pause size={24} style={{ color: "var(--muted-foreground)" }} />
            <p style={{ color: "var(--muted-foreground)", "font-size": "var(--text-sm)" }}>
              Paused. Resume to receive new log output.
            </p>
          </div>
        </Show>

        {/* Log output */}
        <Show when={lines().length > 0}>
          <div
            ref={outputRef}
            class="log-output"
            onScroll={handleScroll}
          >
            <Show
              when={filteredLines().length > 0}
              fallback={
                <div class="log-empty" style={{ "min-height": "220px" }}>
                  <Search size={24} style={{ color: "var(--muted-foreground)" }} />
                  <p style={{ color: "var(--muted-foreground)", "font-size": "var(--text-sm)" }}>
                    No matches for this filter.
                  </p>
                </div>
              }
            >
              <For each={filteredLines()}>
                {(line) => {
                  maybeScroll();
                  return (
                    <div class="log-line">
                      <Show when={line.timestamp}>
                        <span class="log-timestamp">{line.timestamp}</span>
                      </Show>
                      <span class="log-message">{line.message}</span>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>

        {/* Jump to bottom FAB */}
        <Show when={showJumpFab()}>
          <button
            class="log-jump-fab"
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom();
            }}
            title="Jump to bottom"
          >
            <ArrowDown size={16} />
          </button>
        </Show>
      </div>
    </PageShell>
  );
}
