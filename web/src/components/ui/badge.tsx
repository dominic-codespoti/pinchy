import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide backdrop-blur-sm",
  {
    variants: {
      variant: {
        neutral: "border-border-strong bg-[var(--color-elevated)] text-text-2",
        info: "border-info/40 bg-info-subtle text-info",
        success: "border-success/40 bg-success-subtle text-success",
        warning: "border-warning/40 bg-warning-subtle text-warning",
        danger: "border-danger/40 bg-danger-subtle text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/** Map a status string to a Badge variant */
function statusToVariant(
  status: string,
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  const upper = status.toUpperCase();
  if (upper.startsWith("FAILED")) return "danger";
  if (upper === "SUCCESS") return "success";
  if (upper === "RUNNING") return "info";
  return "neutral";
}

export function StatusPill({ status }: { readonly status: string }) {
  return <Badge variant={statusToVariant(status)}>{status}</Badge>;
}
