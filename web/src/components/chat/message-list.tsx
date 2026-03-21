import type { SessionMessage } from "@/api/schemas";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn, toText, formatTimestamp } from "@/lib/utils";

function roleLabel(role: string): string {
  if (role === "user") return "You";
  if (role === "system") return "System";
  return "Agent";
}

function roleAvatar(role: string): string {
  if (role === "user") return "bg-primary/10";
  if (role === "system") return "bg-amber-500/10";
  return "bg-muted";
}

export function MessageRow({ message }: { readonly message: SessionMessage }) {
  const role = message.role;
  const content = toText(message.content);
  if (content.trim().length === 0) return null;

  const isPlain = role === "user" || role === "system";
  const label = roleLabel(role);

  return (
    <div className="flex gap-3 py-3">
      <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", roleAvatar(role))}>
        <span className="text-[10px] font-semibold text-muted-foreground">{label.charAt(0)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className={cn("text-xs font-medium", role === "user" ? "text-primary" : role === "system" ? "text-amber-500" : "text-foreground")}>
            {label}
          </span>
          {message.timestamp != null && (
            <span className="text-[10px] tabular-nums text-muted-foreground opacity-60">
              {formatTimestamp(message.timestamp)}
            </span>
          )}
        </div>
        {isPlain ? (
          <p className={cn("whitespace-pre-wrap break-words text-sm", role === "system" ? "text-amber-500/80" : "text-foreground")}>
            {content}
          </p>
        ) : (
          <MarkdownRenderer content={content} className="text-sm leading-relaxed text-foreground" />
        )}
      </div>
    </div>
  );
}

export function MessageList({ messages }: { readonly messages: ReadonlyArray<SessionMessage> }) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {messages.map((msg, i) => (
        <MessageRow key={`${msg.role}-${msg.timestamp ?? i}-${i}`} message={msg} />
      ))}
    </div>
  );
}
