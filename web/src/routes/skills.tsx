import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Shield,
  Puzzle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { getSkills, queryKeys } from "@/api/client";
import { Badge, Button, Separator, Skeleton } from "@/components/ui";

export function SkillsRoute() {
  const skillsQuery = useQuery({ queryKey: queryKeys.skills, queryFn: getSkills });
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Puzzle className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Skills</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <span className="text-xs text-slate-500">Agent capabilities</span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="!h-7 !w-7 !p-0"
            onClick={() => void skillsQuery.refetch()}
            disabled={skillsQuery.isFetching}
            aria-label="Refresh skills"
          >
            <RefreshCw className={`h-3 w-3 ${skillsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <span className="text-[10px] tabular-nums text-slate-500">
            {skillsQuery.data?.skills.length ?? 0} installed
          </span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5">

          {skillsQuery.isLoading && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(skillsQuery.data?.skills ?? []).map((skill) => {
              const isExpanded = expandedSkill === skill.id;
              return (
                <article
                  key={skill.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <button
                    type="button"
                    className="flex items-center justify-between gap-2 w-full text-left"
                    onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
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
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-600 block">Version</span>
                          <span className="text-slate-300">{skill.version ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-600 block">Scope</span>
                          <span className="text-slate-300">{skill.scope ?? "—"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <FolderOpen className="h-3 w-3" />
                        <span>ID: <span className="text-slate-400 font-mono">{skill.id}</span></span>
                      </div>
                      {skill.operator_managed && (
                        <p className="text-[10px] text-amber-400/70">
                          Managed by operator — changes may be overwritten on restart.
                        </p>
                      )}
                    </div>
                  )}

                  {!isExpanded && (
                    <div className="space-y-0.5 text-[11px] text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <Package className="h-3 w-3" /> Version: {skill.version ?? "-"}
                      </p>
                      <p>Scope: {skill.scope ?? "-"}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {skillsQuery.error && (
            <p className="text-sm text-rose-300 mt-4">Failed to load skills.</p>
          )}
          {!skillsQuery.data?.skills.length && !skillsQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Puzzle className="h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-400">No skills found</p>
              <p className="text-xs text-slate-600 mt-1">Install or author skills to extend agent capabilities.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
