import { useRef, useState, useEffect } from "react";
import { Layers, Trash2, Clock, MoreVertical, Download, Bot, ChevronDown } from "lucide-react";
import { Button, Separator, Select, SelectItem } from "@/shared/ui/components/ui";
import { BottomSheet, ActionSheet } from "@/shared/ui/components/BottomSheet";
import { useViewport } from "@/shared/lib/useViewport";
import { useSwipe, usePullToRefresh } from "@/shared/lib/useTouch";
import { humanBytes, estimateMessages, formatRelativeTime, cn } from "@/shared/lib/utils";
import type { SessionSummary } from "@/shared/api/client";

interface SessionsHeaderProps {
  selectedAgent: string;
  setSelectedAgent: (value: string) => void;
  agentIds: string[];
  sessionCount: number;
  cronSessionCount: number;
  hasCronSessions: boolean;
  onDeleteCron: () => void;
  onDeleteAll: () => void;
  isDeleting: boolean;
  isRefreshing?: boolean;
}

export function SessionsHeader({
  selectedAgent,
  setSelectedAgent,
  agentIds,
  sessionCount,
  cronSessionCount,
  hasCronSessions,
  onDeleteCron,
  onDeleteAll,
  isDeleting,
  isRefreshing,
}: SessionsHeaderProps) {
  const { isMobile } = useViewport();
  const [showAgentSheet, setShowAgentSheet] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-sm font-semibold text-slate-100">Sessions</span>
      </div>
      <Separator className="!h-5 !w-px !bg-white/[0.08]" />
      
      {/* Agent Selector - Desktop: Dropdown, Mobile: Bottom Sheet Trigger */}
      {isMobile ? (
        <button
          type="button"
          onClick={() => setShowAgentSheet(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-slate-200 active:bg-white/[0.08] touch-manipulation"
        >
          <Bot className="h-3.5 w-3.5 text-emerald-400" />
          <span className="truncate max-w-[100px]">{selectedAgent}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      ) : (
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          {(agentIds.length ? agentIds : ["default"]).map((id) => (
            <SelectItem key={id} value={id}>{id}</SelectItem>
          ))}
        </Select>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Mobile: More Actions button */}
        {isMobile && (hasCronSessions || sessionCount > 0) && (
          <button
            type="button"
            onClick={() => setShowActionsSheet(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] active:bg-white/[0.08] touch-manipulation"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
        
        {/* Desktop: Direct action buttons */}
        {!isMobile && hasCronSessions && (
          <Button
            variant="ghost"
            size="sm"
            className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
            disabled={isDeleting}
            onClick={onDeleteCron}
          >
            <Clock className="h-3 w-3" />
            <Trash2 className="h-3 w-3" />
            Cron
          </Button>
        )}
        {!isMobile && sessionCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="!h-7 gap-1 text-[10px] text-slate-400 hover:text-rose-300"
            disabled={isDeleting}
            onClick={onDeleteAll}
          >
            <Trash2 className="h-3 w-3" />
            All
          </Button>
        )}
        
        <span className="text-[10px] tabular-nums text-slate-500">
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
              Refreshing
            </span>
          ) : (
            `${sessionCount} sessions`
          )}
        </span>
      </div>

      {/* Mobile: Agent Selector Bottom Sheet */}
      <BottomSheet
        isOpen={showAgentSheet}
        onClose={() => setShowAgentSheet(false)}
        title="Select Agent"
        snapPoints={[40, 60]}
      >
        <div className="space-y-1">
          {(agentIds.length ? agentIds : ["default"]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelectedAgent(id);
                setShowAgentSheet(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation",
                selectedAgent === id
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "text-slate-300 hover:bg-white/[0.04]"
              )}
            >
              <Bot className="h-4 w-4" />
              <span className="font-medium">{id}</span>
              {selectedAgent === id && (
                <span className="ml-auto text-xs bg-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Mobile: Actions Action Sheet */}
      {isMobile && (
        <ActionSheet
          isOpen={showActionsSheet}
          onClose={() => setShowActionsSheet(false)}
          actions={[
            ...(hasCronSessions ? [{
              label: `Delete ${cronSessionCount} Cron Sessions`,
              onClick: () => {
                onDeleteCron();
                setShowActionsSheet(false);
              },
              destructive: true,
              icon: Clock,
            }] : []),
            ...(sessionCount > 0 ? [{
              label: `Delete All ${sessionCount} Sessions`,
              onClick: () => {
                onDeleteAll();
                setShowActionsSheet(false);
              },
              destructive: true,
              icon: Trash2,
            }] : []),
          ]}
        />
      )}
    </div>
  );
}

interface SessionCardProps {
  session: SessionSummary;
  onClick: () => void;
  onDelete: () => void;
  swipeable?: boolean;
}

export function SessionCard({ session, onClick, onDelete, swipeable = true }: SessionCardProps) {
  const { isMobile } = useViewport();
  
  if (swipeable && isMobile) {
    return (
      <SwipeableSessionCard 
        session={session} 
        onClick={onClick} 
        onDelete={onDelete} 
      />
    );
  }

  return (
    <button
      type="button"
      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-all duration-200 hover:border-emerald-400/20 hover:bg-white/[0.04]"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-200 truncate">{session.title ?? session.session_id}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-rose-400/50 hover:text-rose-300 p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{humanBytes(session.size ?? 0)}</span>
        <span>{estimateMessages(session.size ?? 0)} msgs</span>
        <span>{formatRelativeTime(session.modified ?? 0)}</span>
      </div>
    </button>
  );
}

// Swipeable mobile card with delete action
interface SwipeableSessionCardProps {
  session: SessionSummary;
  onClick: () => void;
  onDelete: () => void;
}

function SwipeableSessionCard({ session, onClick, onDelete }: SwipeableSessionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showingActions, setShowingActions] = useState(false);
  const { deltaX, isDragging } = useSwipe(cardRef as React.RefObject<HTMLElement>, {
    onSwipeLeft: () => {
      setShowingActions(true);
      setSwipeOffset(-100);
    },
    onSwipeRight: () => {
      setShowingActions(false);
      setSwipeOffset(0);
    },
    onSwipeEnd: () => {
      if (swipeOffset > -50) {
        setShowingActions(false);
        setSwipeOffset(0);
      }
    },
    threshold: 30,
    preventDefault: true,
  });

  useEffect(() => {
    if (isDragging) {
      const dampedOffset = Math.max(-120, Math.min(0, deltaX * 0.7));
      setSwipeOffset(dampedOffset);
    }
  }, [deltaX, isDragging]);

  const formattedSize = humanBytes(session.size ?? 0);
  const msgCount = estimateMessages(session.size ?? 0);
  const timeAgo = formatRelativeTime(session.modified ?? 0);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background action layer */}
      <div 
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-colors",
          showingActions ? "bg-rose-500/20" : "bg-transparent"
        )}
        style={{ width: showingActions ? '120px' : '0px' }}
      >
        {showingActions && (
          <button
            type="button"
            onClick={onDelete}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-rose-500 text-white active:bg-rose-600 touch-manipulation"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-[10px] font-medium">Delete</span>
          </button>
        )}
      </div>

      {/* Card content */}
      <div
        ref={cardRef}
        className={cn(
          "relative bg-slate-900/50 border border-white/[0.06] rounded-xl p-4 touch-manipulation",
          isDragging && "cursor-grabbing"
        )}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onClick={() => {
          if (!showingActions && !isDragging) {
            onClick();
          } else if (showingActions) {
            setShowingActions(false);
            setSwipeOffset(0);
          }
        }}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-400/10 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-slate-200 truncate">
              {session.title ?? session.session_id}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
              <span className="bg-white/[0.06] px-2 py-0.5 rounded">{formattedSize}</span>
              <span className="bg-white/[0.06] px-2 py-0.5 rounded">{msgCount} msgs</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5">
              {timeAgo}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 text-slate-500">
            <ChevronDown className="h-4 w-4 -rotate-90" />
            <span className="text-[9px]">Swipe</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PullToRefreshContainerProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

export function PullToRefreshContainer({ children, onRefresh, isRefreshing }: PullToRefreshContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isPulling, pullDistance, isRefreshing: hookRefreshing } = usePullToRefresh(
    containerRef as React.RefObject<HTMLElement>,
    onRefresh
  );

  const showSpinner = isRefreshing || hookRefreshing;

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto">
      {/* Pull to refresh indicator */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center transition-all duration-200 pointer-events-none"
        style={{
          height: `${pullDistance}px`,
          opacity: isPulling ? 1 : 0,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          {showSpinner ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
          ) : (
            <ChevronDown 
              className="h-5 w-5 text-emerald-400 transition-transform"
              style={{ transform: `rotate(${Math.min(pullDistance * 1.5, 180)}deg)` }}
            />
          )}
          <span className="text-[10px] text-slate-500">
            {showSpinner ? "Refreshing..." : pullDistance > 80 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

// Session list with pull-to-refresh for mobile
interface MobileSessionListProps {
  sessions: SessionSummary[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onSessionClick: (session: SessionSummary) => void;
  onSessionDelete: (session: SessionSummary) => void;
}

export function MobileSessionList({
  sessions,
  isLoading,
  onRefresh,
  onSessionClick,
  onSessionDelete,
}: MobileSessionListProps) {
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
  const { isMobile } = useViewport();

  if (!isMobile) {
    return null;
  }

  return (
    <PullToRefreshContainer onRefresh={onRefresh}>
      <div className="px-3 py-3 space-y-3">
        {sessions.map((session) => (
          <SessionCard
            key={session.session_id}
            session={session}
            onClick={() => onSessionClick(session)}
            onDelete={() => onSessionDelete(session)}
            swipeable={true}
          />
        ))}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            <span className="text-sm text-slate-500">Loading sessions...</span>
          </div>
        )}

        {!sessions.length && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-12 w-12 text-slate-700 mb-4" />
            <p className="text-sm text-slate-400">No sessions found</p>
            <p className="text-xs text-slate-600 mt-1">Sessions appear here as agents interact.</p>
            <button
              type="button"
              onClick={() => onRefresh()}
              className="mt-4 px-4 py-2 rounded-lg bg-white/[0.04] text-xs text-slate-400 hover:text-slate-200 active:bg-white/[0.08] touch-manipulation"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Mobile Actions Sheet */}
      <ActionSheet
        isOpen={showActionSheet && !!selectedSession}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedSession(null);
        }}
        actions={[
          {
            label: "View Session",
            onClick: () => {
              if (selectedSession) onSessionClick(selectedSession);
              setShowActionSheet(false);
            },
            icon: Layers,
          },
          {
            label: "Export Session",
            onClick: () => {
              // Export would be handled by parent
              setShowActionSheet(false);
            },
            icon: Download,
          },
          {
            label: "Delete Session",
            onClick: () => {
              if (selectedSession) onSessionDelete(selectedSession);
              setShowActionSheet(false);
            },
            destructive: true,
            icon: Trash2,
          },
        ]}
      />
    </PullToRefreshContainer>
  );
}
