import { cn } from "@/shared/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * PageContainer is now a pass-through component.
 * Width constraints are handled at the layout level in app/layout.tsx.
 * Kept for backward compatibility - any additional className will be applied.
 */
export function PageContainer({
  children,
  className,
}: PageContainerProps) {
  return <div className={cn(className)}>{children}</div>;
}
