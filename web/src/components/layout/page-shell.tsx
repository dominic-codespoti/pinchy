import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── PageShell ────────────────────────────────────────
// Standardized route wrapper. Every page gets:
//   1. A fixed h-12 header bar (glass surface, bottom border)
//   2. A scrollable content area with consistent max-width + padding

interface PageShellProps {
  /** Header slot — rendered inside the fixed header bar */
  readonly header: ReactNode;
  readonly children: ReactNode;
  /** Max width for content area. Default "4xl" */
  readonly maxWidth?: "2xl" | "3xl" | "4xl" | "5xl" | "full";
  /** Additional className on root container */
  readonly className?: string;
}

const maxWidthMap = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  full: "w-full",
} as const;

export function PageShell({
  header,
  children,
  maxWidth = "4xl",
  className,
}: PageShellProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-2 px-4 h-11 border-b border-border bg-[var(--color-elevated)]">
        {header}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={cn(
            maxWidthMap[maxWidth],
            "mx-auto px-4 py-5 space-y-4",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ── PageTitle ────────────────────────────────────────
// Icon + title for use inside PageShell header slot

interface PageTitleProps {
  readonly icon: ReactNode;
  readonly title: string;
  /** Optional trailing content (buttons, etc.) */
  readonly children?: ReactNode;
}

export function PageTitle({ icon, title, children }: PageTitleProps) {
  return (
    <>
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-subtle text-accent">
        {icon}
      </div>
      <h1 className="text-sm font-semibold text-text-1">{title}</h1>
      {children != null && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </>
  );
}
