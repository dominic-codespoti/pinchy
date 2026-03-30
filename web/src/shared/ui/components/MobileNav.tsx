import React, { useState, useEffect, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useViewport } from "@/shared/lib/useViewport";
import { Button } from "@/shared/ui/components/ui";
import { cn } from "@/shared/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MobileNavProps {
  items: NavItem[];
  className?: string;
}

export function MobileNav({ items, className }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname;

  const handleNavigate = useCallback(
    (to: string) => {
      navigate({ to });
      setIsOpen(false);
    },
    [navigate]
  );

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [currentPath]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isMobile) return null;

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-950/95 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4">
        <span className="text-sm font-semibold text-slate-100">Pinchy</span>
        <Button
          variant="ghost"
          size="sm"
          className="!h-8 !w-8 !p-0"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />

        {/* Drawer Content */}
        <div
          className={cn(
            "absolute left-0 top-14 bottom-0 w-[280px] bg-slate-950 border-r border-white/[0.06] transform transition-transform duration-300 ease-out",
            isOpen ? "translate-x-0" : "-translate-x-full",
            className
          )}
        >
          <nav className="p-4 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath.startsWith(item.to);

              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleNavigate(item.to)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-14" />
    </>
  );
}

export function MobileBottomNav({ items }: { items: NavItem[] }) {
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-t border-white/[0.06] safe-area-pb">
      <nav className="flex items-center justify-around px-2 py-2">
        {items.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentPath.startsWith(item.to);

          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[64px]",
                isActive
                  ? "text-emerald-400"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "scale-110")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
