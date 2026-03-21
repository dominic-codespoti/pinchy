import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "flex h-9 w-full rounded-xl border border-border bg-[var(--color-elevated)] px-3.5 py-2 text-sm text-text-1",
        "shadow-[var(--glass-inset)] backdrop-blur-md",
        "placeholder:text-text-3/80",
        "hover:border-border-strong hover:bg-[var(--glass-bg)]",
        "focus:border-accent/40 focus:bg-[var(--glass-bg)] focus:shadow-ring focus:outline-none",
        "transition-all duration-200 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
});
