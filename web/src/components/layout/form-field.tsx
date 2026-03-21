import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  /** Label text */
  readonly label: string;
  /** Optional helper text below the input */
  readonly hint?: string;
  /** Form control (Input, Select, Textarea, etc.) */
  readonly children: ReactNode;
  /** Additional className on the wrapper */
  readonly className?: string;
  /** Display label inline with the control (for checkboxes) */
  readonly inline?: boolean;
}

export function FormField({
  label,
  hint,
  children,
  className,
  inline = false,
}: FormFieldProps) {
  if (inline) {
    return (
      <label className={cn("flex items-center gap-2 cursor-pointer", className)}>
        {children}
        <span className="text-sm text-foreground">{label}</span>
      </label>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint != null && hint.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
