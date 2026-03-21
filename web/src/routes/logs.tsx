import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollText, Pause, Play, Trash2, ArrowDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";
import { cn, wsUrl } from "@/lib/utils";

type LogLine = { raw: string; timestamp: string; message: string };
const MAX_LINES = 5000;
const TS_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)/;

function parseLine(raw: string): LogLine {
  const m = raw.match(TS_RE);
  return m ? { raw, timestamp: m[1] ?? "", message: m[2] ?? "" } : { raw, timestamp: "", message: raw };
}

/** Ref whose `.current` always tracks the latest state value */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function LogsRoute() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useLatestRef(paused);

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoScroll]);

  const connect = useCallback(() => {
    const ws = new WebSocket(wsUrl("/ws/logs"));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      if (pausedRef.current) return;
      const parsed = parseLine(typeof ev.data === "string" ? ev.data : "");
      setLines((prev) => {
        const next = [...prev, parsed];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    };
    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => { ws.close(); };
  }, []);

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null; }, []);

  useEffect(() => { connect(); return disconnect; }, [connect, disconnect]);

  const handleTogglePause = useCallback(() => {
    setPaused((p) => { const next = !p; if (next) disconnect(); else connect(); return next; });
  }, [connect, disconnect]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar — matches PageShell styling */}
      <div className="flex shrink-0 items-center gap-2 px-4 h-11 border-b border-border bg-muted">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ScrollText className="h-3 w-3" />
        </div>
        <h1 className="text-sm font-semibold text-foreground">Logs</h1>
        <span className="text-[10px] tabular-nums text-muted-foreground">{lines.length} lines</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={handleTogglePause}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLines([])}>
            <Trash2 className="h-3 w-3" /> Clear
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAutoScroll((p) => !p)}
            className={cn("gap-1", autoScroll && "text-primary")}>
            <ArrowDown className="h-3 w-3" /> Auto-scroll
          </Button>
        </div>
      </div>

      {/* Log viewer */}
      <div className="flex-1 overflow-hidden p-2 relative">
        <Card className="h-full flex flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="text-xs">
              Stream
              <span className={cn("ml-2 inline-block h-2 w-2 rounded-full",
                paused ? "bg-amber-500" : "bg-emerald-500 animate-status-pulse")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-auto px-3 pb-3">
              {lines.map((line, i) => (
                <div key={i} className="font-mono text-xs leading-5 hover:bg-muted rounded px-1">
                  {line.timestamp && (
                    <span className="text-primary opacity-70 mr-2 select-none">{line.timestamp}</span>
                  )}
                  <span className="text-foreground break-all">{line.message}</span>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="text-xs text-muted-foreground opacity-60 py-8 text-center">
                  {paused ? "Paused \u2014 click Resume to reconnect" : "Waiting for log data..."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        {!autoScroll && lines.length > 0 && (
          <button type="button" onClick={scrollToBottom}
            className="absolute bottom-5 right-5 flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-lg hover:bg-muted transition-all">
            <ArrowDown className="h-3 w-3" /> Jump to bottom
          </button>
        )}
      </div>
    </div>
  );
}
