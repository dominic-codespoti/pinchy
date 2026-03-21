import type { ToolCall } from "@/hooks/use-agent-chat";
import { Badge } from "@/components/ui";
import { Wrench, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolActivityProps {
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly isTyping: boolean;
}

function statusIcon(status: string) {
  if (status === "success") return <Check className="h-3 w-3 text-success" />;
  if (status === "error") return <X className="h-3 w-3 text-danger" />;
  return <Wrench className="h-3 w-3 animate-spin text-text-3" />;
}

function statusVariant(status: string) {
  if (status === "success") return "success" as const;
  if (status === "error") return "danger" as const;
  return "neutral" as const;
}

export function ToolActivity({ toolCalls, isTyping }: ToolActivityProps) {
  if (toolCalls.length === 0 && !isTyping) return null;

  return (
    <div className="rounded-lg border border-border bg-[var(--color-elevated)] px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Wrench className="h-3 w-3 text-text-3" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-3">
          Tool Activity
        </span>
        <span className="text-[10px] tabular-nums text-text-3 opacity-60">
          {toolCalls.length}
        </span>
      </div>

      <div className="space-y-1">
        {toolCalls.map((call, i) => (
          <div
            key={`${call.tool}-${i}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
              call.status === "error"
                ? "bg-danger-subtle"
                : "bg-[var(--color-elevated)]",
            )}
          >
            {statusIcon(call.status)}
            <Badge variant={statusVariant(call.status)}>{call.tool}</Badge>
            {call.argsSummary.length > 0 && (
              <span className="truncate text-[10px] text-text-3">
                {call.argsSummary}
              </span>
            )}
            {call.durationMs !== null && (
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-3 opacity-60">
                {call.durationMs >= 1000
                  ? `${(call.durationMs / 1000).toFixed(1)}s`
                  : `${call.durationMs}ms`}
              </span>
            )}
            {call.error.length > 0 && (
              <span className="truncate text-[10px] text-danger">
                {call.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
