import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <div
        className={cn(
          "group relative flex flex-col rounded-xl border border-border bg-[var(--color-elevated)]",
          "shadow-[var(--glass-inset)] backdrop-blur-md",
          "transition-all duration-200 ease-out",
          "hover:border-border-strong hover:bg-[var(--glass-bg)]",
          "focus-within:border-accent/40 focus-within:bg-[var(--glass-bg)] focus-within:shadow-ring",
          "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40",
        )}
      >
        <textarea
          ref={ref}
          {...rest}
          className={cn(
            "w-full flex-1 resize-none rounded-xl bg-transparent px-4 py-3 text-sm leading-relaxed text-text-1",
            "placeholder:text-text-3/60",
            "focus:outline-none",
            "disabled:cursor-not-allowed",
            className,
          )}
        />
      </div>
    );
  },
);
