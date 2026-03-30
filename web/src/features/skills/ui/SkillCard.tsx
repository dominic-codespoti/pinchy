import { Sparkles, Shield, ChevronDown, ChevronRight, FolderOpen, Trash2, MoreHorizontal } from "lucide-react";
import { Badge, Button } from "@/shared/ui/components/ui";
import type { Skill } from "@/shared/api/client";

interface SkillCardProps {
  skill: Skill;
  isExpanded: boolean;
  onToggle: () => void;
  onShowActions: () => void;
  onDeleteRequest: () => void;
  showActionsButton: boolean;
}

export function SkillCard({
  skill,
  isExpanded,
  onToggle,
  onShowActions,
  onDeleteRequest,
  showActionsButton,
}: SkillCardProps) {
  return (
    <article 
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04] active:scale-[0.99]"
    >
      {/* Main card header - optimized for touch */}
      <button
        type="button"
        className="flex items-center justify-between gap-3 w-full text-left p-4 min-h-[64px]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 shrink-0">
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-slate-200 truncate">{skill.id}</h2>
            <p className="text-xs text-slate-500 line-clamp-1">{skill.description ?? "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {skill.operator_managed && (
            <Badge variant="success" className="gap-1 !text-[10px] !px-2 !py-0.5">
              <Shield className="h-3 w-3" />
              operator
            </Badge>
          )}
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-slate-500" />
            : <ChevronRight className="h-4 w-4 text-slate-500" />
          }
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/[0.06]">
          <div className="pt-3 space-y-3">
            {/* Skill ID */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">ID: <span className="text-slate-400 font-mono">{skill.id}</span></span>
            </div>
            
            {/* Operator managed warning */}
            {skill.operator_managed && (
              <p className="text-xs text-amber-400/70">
                Managed by operator — changes may be overwritten on restart.
              </p>
            )}
            
            {/* Actions - mobile uses actions button, desktop shows direct delete */}
            <div className="pt-2">
              {showActionsButton ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-10 gap-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowActions();
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  Actions
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 px-3 text-rose-400/60 hover:text-rose-300 hover:bg-rose-400/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRequest();
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
