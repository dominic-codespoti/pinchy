import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Send } from "lucide-react";

// Augment CSSProperties with the `fieldSizing` property (CSS Intrinsic Sizing Level 4)
declare module "react" {
  interface CSSProperties {
    fieldSizing?: "content" | "fixed";
  }
}

interface ChatInputProps {
  readonly onSend: (message: string) => void;
  readonly disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setDraft("");
    textareaRef.current?.focus();
  }, [draft, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        disabled={disabled}
        rows={1}
        className="max-h-36 flex-1 resize-none rounded-xl border border-border bg-[var(--color-elevated)] px-3 py-2 text-sm leading-5 text-text-1 placeholder:text-text-3/60 outline-none focus:border-accent/40 focus:shadow-ring disabled:opacity-50 transition-all duration-200"
        style={{ fieldSizing: "content" }}
      />
      <Button
        variant="primary"
        size="md"
        onClick={handleSend}
        disabled={disabled || draft.trim().length === 0}
        className="shrink-0"
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
