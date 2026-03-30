import { Send, Activity, Sparkles, Zap } from "lucide-react";
import { TextArea } from "@/shared/ui/components/ui";

interface ChatInputProps {
  draft: string;
  setDraft: (value: string) => void;
  onSend: () => void;
  isTyping: boolean;
  typingLabel: string;
  showActivity: boolean;
  setShowActivity: (value: boolean) => void;
}

export function ChatInput({
  draft,
  setDraft,
  onSend,
  isTyping,
  typingLabel,
  showActivity,
  setShowActivity,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isTyping && draft.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-[var(--glass-border)] bg-[var(--surface-1)] p-3">
      <div className="flex gap-2">
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your agent something..."
          className="min-h-[60px] flex-1 resize-none bg-white/[0.03] border-white/[0.06] text-slate-100 placeholder:text-slate-500"
          disabled={isTyping}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSend}
            disabled={isTyping || !draft.trim()}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:opacity-40 transition-all"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowActivity(!showActivity)}
            className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${
              showActivity
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                : "border-white/[0.06] bg-white/[0.03] text-slate-500 hover:text-slate-300"
            }`}
            title="Toggle activity panel"
          >
            <Activity className="h-4 w-4" />
          </button>
        </div>
      </div>
      {isTyping && (
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <Sparkles className="h-3 w-3 animate-pulse" />
          <span>{typingLabel}</span>
          <Zap className="h-3 w-3 animate-pulse" />
        </div>
      )}
      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-600">
        <span>↵ send · shift+↵ newline</span>
      </div>
    </div>
  );
}
