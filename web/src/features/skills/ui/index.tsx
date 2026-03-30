import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Puzzle, Trash2 } from "lucide-react";

import { getSkills, deleteSkill, queryKeys } from "@/shared/api/client";
import { useViewport } from "@/shared/lib/useViewport";
import { usePullToRefresh } from "@/shared/lib/useTouch";
import { ActionSheet, BottomSheet } from "@/shared/ui/components/BottomSheet";
import { Dialog, DialogContent, DialogTitle, Button } from "@/shared/ui/components/ui";
import { SkillsHeader, SkillCardSkeleton, PullToRefreshIndicator } from "./SkillsHeader";
import { SkillCard } from "./SkillCard";
import type { Skill } from "@/shared/api/client";

export function SkillsRoute() {
  const queryClient = useQueryClient();
  const { isMobile, touchSupported } = useViewport();
  const skillsQuery = useQuery({ queryKey: queryKeys.skills, queryFn: getSkills });
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillForActionSheet, setSkillForActionSheet] = useState<Skill | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Skill | null>(null);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(
    scrollRef,
    async () => {
      await skillsQuery.refetch();
    }
  );

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      setConfirmDelete(null);
      setSkillForActionSheet(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills });
    },
  });

  const handleToggleExpand = (skillId: string) => {
    setExpandedSkill(expandedSkill === skillId ? null : skillId);
  };

  const handleShowActions = (skill: Skill) => {
    if (isMobile && touchSupported) {
      setSkillForActionSheet(skill);
    }
  };

  const handleDeleteRequest = (skill: Skill) => {
    if (isMobile && touchSupported) {
      setSkillForActionSheet(skill);
    } else {
      setConfirmDelete(skill);
    }
  };

  const actionSheetActions = skillForActionSheet
    ? [
        {
          label: "Delete Skill",
          onClick: () => setConfirmDelete(skillForActionSheet),
          destructive: true,
          icon: Trash2,
        },
      ]
    : [];

  // Grid columns based on viewport
  const gridCols = isMobile ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <SkillsHeader
        skillCount={skillsQuery.data?.skills.length ?? 0}
        isFetching={skillsQuery.isFetching}
        isRefreshing={isRefreshing}
        onRefresh={() => void skillsQuery.refetch()}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {/* Pull to refresh indicator */}
        {touchSupported && (
          <PullToRefreshIndicator 
            isPulling={isPulling} 
            pullDistance={pullDistance} 
            isRefreshing={isRefreshing}
          />
        )}

        <div className="max-w-4xl mx-auto px-4 py-5">
          {skillsQuery.isLoading && (
            <div className={`grid ${gridCols} gap-3`}>
              {[1, 2, 3].map((i) => <SkillCardSkeleton key={i} />)}
            </div>
          )}

          <div className={`grid ${gridCols} gap-3`}>
            {(skillsQuery.data?.skills ?? []).map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isExpanded={expandedSkill === skill.id}
                onToggle={() => handleToggleExpand(skill.id)}
                onShowActions={() => handleShowActions(skill)}
                onDeleteRequest={() => handleDeleteRequest(skill)}
                showActionsButton={isMobile && touchSupported}
              />
            ))}
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

      {/* Mobile: Action Sheet for skill actions */}
      {isMobile && (
        <ActionSheet
          isOpen={!!skillForActionSheet && !confirmDelete}
          onClose={() => setSkillForActionSheet(null)}
          actions={actionSheetActions}
        />
      )}

      {/* Delete Confirmation Dialog / Bottom Sheet */}
      {isMobile ? (
        <BottomSheet
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Delete Skill?"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Are you sure you want to delete <span className="text-slate-200 font-medium">{confirmDelete?.id}</span>?
              This action cannot be undone.
            </p>
            {confirmDelete?.operator_managed && (
              <p className="text-xs text-amber-400/70">
                This skill is managed by the operator. It may be recreated on restart.
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 h-11 text-slate-400"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                className="flex-1 h-11 text-rose-400 hover:bg-rose-400/10"
                onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </BottomSheet>
      ) : (
        <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
          <DialogContent>
            <DialogTitle className="text-sm font-semibold text-slate-100">Delete Skill?</DialogTitle>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-slate-400">
                Are you sure you want to delete <span className="text-slate-200 font-medium">{confirmDelete?.id}</span>?
                This action cannot be undone.
              </p>
              {confirmDelete?.operator_managed && (
                <p className="text-xs text-amber-400/70">
                  This skill is managed by the operator. It may be recreated on restart.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-400 hover:bg-rose-400/10"
                  onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
