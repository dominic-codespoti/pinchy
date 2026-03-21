import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";

interface SelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
  readonly placeholder?: string;
  readonly className?: string;
}

export function Select({
  value,
  onValueChange,
  disabled,
  children,
  placeholder,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled ?? false}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-[var(--color-elevated)] px-3 text-sm text-text-1",
          "shadow-[var(--glass-inset)] backdrop-blur-md",
          "hover:border-border-strong hover:bg-[var(--glass-bg)]",
          "focus:border-accent/40 focus:bg-[var(--glass-bg)] focus:shadow-ring focus:outline-none",
          "transition-all duration-200 ease-out",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "data-[placeholder]:text-text-3",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder ?? "Select..."} />
        </span>
        <SelectPrimitive.Icon className="ml-auto shrink-0 text-text-3">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            "relative z-50 max-h-72 min-w-[8rem] overflow-hidden",
            "rounded-xl border border-border-strong bg-surface-0/95 shadow-dropdown",
            "backdrop-blur-xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          )}
          position="popper"
          sideOffset={4}
          align="start"
        >
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

interface SelectItemProps {
  readonly value: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function SelectItem({ value, children, className }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-lg px-2.5 py-1.5 text-sm text-text-2 outline-none",
        "data-[highlighted]:bg-accent-subtle data-[highlighted]:text-text-1",
        "data-[state=checked]:text-accent",
        "transition-colors duration-100",
        className,
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ml-auto">
        <svg
          className="h-3.5 w-3.5 text-accent"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
