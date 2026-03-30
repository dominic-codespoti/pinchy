import { Terminal, Wrench, Check, X } from "lucide-react";

interface ActivityItemProps {
  text: string;
  timestamp: number;
  kind: "tool" | "receipt" | "info" | "error";
}

const KIND_ICONS = {
  tool: Wrench,
  receipt: Check,
  info: Terminal,
  error: X,
};

const KIND_COLORS = {
  tool: "text-amber-400",
  receipt: "text-emerald-400",
  info: "text-blue-400",
  error: "text-rose-400",
};

export function ActivityItem({ text, timestamp, kind }: ActivityItemProps) {
  const Icon = KIND_ICONS[kind];
  const colorClass = KIND_COLORS[kind];
  
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/[0.02]">
      <Icon className={`h-3 w-3 mt-0.5 ${colorClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 truncate">{text}</p>
        <p className="text-[10px] text-slate-600">
          {new Date(timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

interface ActivityPanelProps {
  items: ActivityItemProps[];
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityPanel({ items, isOpen, onClose }: ActivityPanelProps) {
  if (!isOpen) return null;
  
  return (
    <div className="w-80 border-l border-[var(--glass-border)] bg-[var(--surface-1)] flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium text-slate-200">Activity</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">No activity yet</p>
        ) : (
          items.map((item, i) => <ActivityItem key={i} {...item} />)
        )}
      </div>
    </div>
  );
}
