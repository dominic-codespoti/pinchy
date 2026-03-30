import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import { useSwipe } from "@/shared/lib/useTouch";
import { useViewport } from "@/shared/lib/useViewport";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  snapPoints?: number[];
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  className,
  snapPoints = [25, 50, 85],
}: BottomSheetProps) {
  const { isMobile } = useViewport();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState(0);

  const handleSwipeDown = useCallback(() => {
    if (currentSnap === 0) {
      onClose();
    } else {
      setCurrentSnap((prev) => Math.max(0, prev - 1));
    }
  }, [currentSnap, onClose]);

  const handleSwipeUp = useCallback(() => {
    setCurrentSnap((prev) => Math.min(snapPoints.length - 1, prev + 1));
  }, [snapPoints.length]);

  useSwipe(sheetRef as React.RefObject<HTMLElement>, {
    onSwipeDown: handleSwipeDown,
    onSwipeUp: handleSwipeUp,
    threshold: 50,
    preventDefault: true,
  });

  if (!isMobile) {
    // Desktop: render as dialog
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className={cn(
            "relative bg-slate-950 border border-white/[0.06] rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden",
            className
          )}
        >
          {title && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>
          )}
          <div className="p-4 overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }

  // Mobile: render as bottom sheet
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-300",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "absolute left-0 right-0 bg-slate-950 border-t border-white/[0.06] rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
          className
        )}
        style={{
          bottom: 0,
          height: `${snapPoints[currentSnap]}vh`,
        }}
      >
        {/* Handle */}
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 p-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-y-auto h-[calc(100%-60px)]">{children}</div>
      </div>
    </div>
  );
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  actions: Array<{
    label: string;
    onClick: () => void;
    destructive?: boolean;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  cancelText?: string;
}

export function ActionSheet({
  isOpen,
  onClose,
  actions,
  cancelText = "Cancel",
}: ActionSheetProps) {
  const { isMobile } = useViewport();

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-300",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={cn(
          "absolute bg-slate-900/95 backdrop-blur-xl rounded-t-3xl transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
          isMobile ? "left-2 right-2 bottom-2" : "left-1/2 -translate-x-1/2 bottom-4 w-[400px] rounded-3xl"
        )}
      >
        <div className="p-2 space-y-1">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-medium transition-all",
                  action.destructive
                    ? "text-rose-400 hover:bg-rose-400/10"
                    : "text-slate-200 hover:bg-white/[0.06]"
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {action.label}
              </button>
            );
          })}
        </div>

        <div className="p-2 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3.5 rounded-xl bg-white/[0.08] text-sm font-semibold text-slate-200 hover:bg-white/[0.12] transition-all"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
