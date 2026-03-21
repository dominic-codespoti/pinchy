import type { ReactNode } from "react";

interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-muted-foreground opacity-40 [&>svg]:h-8 [&>svg]:w-8">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
      {subtitle != null && (
        <p className="mt-1 text-xs text-muted-foreground opacity-60">{subtitle}</p>
      )}
    </div>
  );
}
