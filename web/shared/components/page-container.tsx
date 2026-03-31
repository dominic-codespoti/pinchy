import { cn } from "@/shared/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  /** 'default' = standard content width for most pages, 'narrow' = settings/form pages, 'full' = full width (chat, test) */
  maxWidth?: "default" | "narrow" | "full";
  className?: string;
}

export function PageContainer({
  children,
  maxWidth = "default",
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8",
        maxWidth === "default" && "max-w-7xl",
        maxWidth === "narrow" && "max-w-4xl",
        maxWidth === "full" && "max-w-none",
        className
      )}
    >
      {children}
    </div>
  );
}
