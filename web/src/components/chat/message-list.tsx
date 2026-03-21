import type { SessionMessage } from "@/api/schemas";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn, toText, formatRelativeTime } from "@/lib/utils";

interface MessageListProps {
  readonly messages: ReadonlyArray<SessionMessage>;
}

function roleLabel(role: string): string {
  if (role === "user") return "You";
  if (role === "system") return "System";
  return "Agent";
}

function roleStyles(role: string): {
  readonly avatar: string;
  readonly label: string;
} {
  if (role === "user") return { avatar: "bg-accent-subtle", label: "text-accent" };
  if (role === "system") return { avatar: "bg-warning-subtle", label: "text-warning" };
  return { avatar: "bg-[var(--color-elevated)]", label: "text-text-1" };
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-3">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {messages.map((message, i) => {
        const role = message.role ?? "assistant";
        const content = toText(message.content);
        if (content.trim().length === 0) return null;

        const styles = roleStyles(role);
        const isAssistant = role !== "user" && role !== "system";

        return (
          <div key={`${role}-${message.timestamp ?? i}-${i}`} className="py-3">
            <div className="flex gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  styles.avatar,
                )}
              >
                <span className="text-[10px] font-semibold text-text-3">
                  {roleLabel(role).charAt(0)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className={cn("text-xs font-medium", styles.label)}>
                    {roleLabel(role)}
                  </span>
                  {message.timestamp != null && (
                    <span className="text-[10px] tabular-nums text-text-3 opacity-60">
                      {formatRelativeTime(message.timestamp)}
                    </span>
                  )}
                </div>

                {isAssistant ? (
                  <MarkdownRenderer
                    content={content}
                    className="text-sm leading-relaxed text-text-2"
                  />
                ) : (
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words text-sm",
                      role === "system" ? "text-warning/80" : "text-text-1",
                    )}
                  >
                    {content}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
