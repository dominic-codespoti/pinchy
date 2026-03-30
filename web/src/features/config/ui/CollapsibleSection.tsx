import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  sectionKey: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  onToggle: (key: string) => void;
  actions?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  sectionKey,
  label,
  icon: Icon,
  collapsed,
  onToggle,
  actions,
  description,
  children,
}: CollapsibleSectionProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex items-center gap-2 w-full p-5 pb-0 text-left"
      >
        <Chevron className="h-3 w-3 text-slate-600 shrink-0" />
        {Icon && <Icon className="h-3.5 w-3.5 text-emerald-400/60" />}
        <span className="text-xs font-medium text-slate-300">{label}</span>
        {actions && (
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </button>
      {description && !collapsed && <p className="text-[10px] text-slate-500 px-5 mt-1">{description}</p>}
      {!collapsed && <div className="p-5 pt-4">{children}</div>}
      {collapsed && <div className="h-2" />}
    </div>
  );
}
