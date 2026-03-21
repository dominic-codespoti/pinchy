import type { ReactNode } from "react";

interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-text-3 opacity-40 [&>svg]:h-8 [&>svg]:w-8">
        {icon}
      </div>
      <p className="text-sm text-text-2">{title}</p>
      {subtitle != null && (
        <p className="text-xs text-text-3 opacity-60 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
