import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly orientation?: "horizontal" | "vertical";
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-r from-transparent via-border to-transparent",
        orientation === "horizontal"
          ? "h-px w-full"
          : "h-full w-px bg-gradient-to-b",
        className,
      )}
      role="separator"
      aria-orientation={orientation}
      {...props}
    />
  );
}
