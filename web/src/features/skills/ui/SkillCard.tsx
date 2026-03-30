import { Sparkles, Shield, ChevronDown, ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { Badge, Button } from "@/shared/ui/components/ui";
import type { Skill } from "@/shared/api/client";

interface SkillCardProps {
  skill: Skill;
  isExpanded: boolean;
  isConfirmingDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  isDeleting: boolean;
}

export function SkillCard({
  skill,
  isExpanded,
  isConfirmingDelete,
  onToggle,
  onDelete,
  onCancelDelete,
  isDeleting,
}: SkillCardProps) {
  return (
    <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]">
      <button
        type="button"
        className="flex items-center justify-between gap-2 w-full text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <h2 className="text-sm font-medium text-slate-200">{skill.id}</h2>
        </div>
        <div className="flex items-center gap-2">
          {skill.operator_managed && (
            <Badge variant="success" className="gap-1 !text-[9px]">
              <Shield className="h-2.5 w-2.5" />
              operator
            </Badge>
          )}
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          }
        </div>
      </button>
      <p className="text-xs text-slate-500">{skill.description ?? "No description"}</p>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <FolderOpen className="h-3 w-3" />
            <span>ID: <span className="text-slate-400 font-mono">{skill.id}</span></span>
          </div>
          {skill.operator_managed && (
            <p className="text-[10px] text-amber-400/70">
              Managed by operator — changes may be overwritten on restart.
            </p>
          )}
          <div className="pt-1">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-rose-400">Delete this skill?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="!h-6 !px-2 !text-[11px] text-rose-400 hover:bg-rose-400/10"
                  onClick={onDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="!h-6 !px-2 !text-[11px] text-slate-500"
                  onClick={onCancelDelete}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="!h-6 gap-1 !px-2 !text-[11px] text-rose-400/50 hover:text-rose-300 hover:bg-rose-400/10"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
