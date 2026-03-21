import { cn } from "@/lib/utils";

export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn("animate-shimmer rounded-lg bg-[var(--color-elevated)]", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
        backgroundSize: "200% 100%",
      }}
    />
  );
}
