import { MessageSquare, Bot, User, AlertCircle } from "lucide-react";
import { Separator, Badge } from "@/shared/ui/components/ui";

interface ChatHeaderProps {
  selectedAgent: string;
  agentCount: number;
  onAgentChange: (value: string) => void;
  agentIds: string[];
  sessionTitle?: string;
}

export function ChatHeader({
  selectedAgent,
  agentCount,
  onAgentChange,
  agentIds,
  sessionTitle,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Chat</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      <select
        value={selectedAgent}
        onChange={(e) => onAgentChange(e.target.value)}
        className="text-xs bg-transparent text-slate-300 border border-white/[0.06] rounded px-2 py-1"
      >
        {(agentIds.length ? agentIds : ["default"]).map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
      {sessionTitle && (
        <>
          <Separator className="!h-5 !w-px !bg-white/[0.08]" />
          <span className="text-xs text-slate-500 truncate max-w-[200px]">{sessionTitle}</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="neutral" className="!text-[10px]">{agentCount} agents</Badge>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: React.ReactNode;
  timestamp?: number;
}

export function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  const isUser = role === "user";
  
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        isUser ? "bg-blue-400/10" : "bg-emerald-400/10"
      }`}>
        {isUser ? (
          <User className="h-4 w-4 text-blue-400" />
        ) : role === "system" ? (
          <AlertCircle className="h-4 w-4 text-amber-400" />
        ) : (
          <Bot className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div className={`flex-1 ${isUser ? "items-end" : "items-start"}`}>
        <div className={`rounded-xl p-3 max-w-[85%] ${
          isUser 
            ? "bg-blue-400/10 border border-blue-400/20 ml-auto" 
            : "bg-white/[0.03] border border-white/[0.06]"
        }`}>
          <div className="prose prose-invert prose-sm max-w-none">{content}</div>
        </div>
        {timestamp && (
          <span className="text-[10px] text-slate-600 mt-1 block">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
