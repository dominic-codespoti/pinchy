import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        primary:
          "border border-accent/80 bg-accent text-accent-fg hover:brightness-110 hover:shadow-glow active:scale-[0.98]",
        secondary:
          "glass-panel border-border bg-[var(--glass-bg)] text-text-1 hover:bg-[var(--color-elevated)] hover:border-border-strong",
        danger:
          "border border-danger/50 bg-danger-subtle text-text-1 hover:bg-[rgba(var(--color-danger),0.25)] hover:border-danger/60",
        ghost:
          "border border-transparent text-text-2 hover:bg-[var(--color-elevated)] hover:text-text-1",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
