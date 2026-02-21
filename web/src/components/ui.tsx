import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Slot } from "@radix-ui/react-slot";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* ── Button ────────────────────────────────────────── */

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30",
  {
    variants: {
      variant: {
        primary:
          "border border-emerald-400/80 bg-emerald-400 text-slate-950 hover:border-emerald-300 hover:bg-emerald-300 hover:shadow-glow active:scale-[0.98]",
        secondary:
          "glass-panel border-slate-300/20 bg-[var(--glass-bg)] text-slate-100 hover:bg-white/[0.08] hover:border-slate-300/30",
        danger:
          "border border-rose-400/50 bg-rose-400/15 text-rose-100 hover:bg-rose-400/25 hover:border-rose-400/60",
        ghost:
          "border border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-slate-100",
      },
      size: {
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

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* ── Badge ─────────────────────────────────────────── */

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide backdrop-blur-sm",
  {
    variants: {
      variant: {
        neutral: "border-slate-300/25 bg-white/[0.06] text-slate-300",
        info: "border-teal-300/40 bg-teal-300/10 text-teal-100",
        success: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
        warning: "border-amber-300/40 bg-amber-300/10 text-amber-100",
        danger: "border-rose-300/40 bg-rose-300/10 text-rose-100",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ── Card ──────────────────────────────────────────── */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("glass-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-2 p-4 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold tracking-tight text-slate-100", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-slate-400", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* ── Separator ─────────────────────────────────────── */

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-gradient-to-r from-transparent via-slate-300/12 to-transparent", className)} {...props} />;
}

/* ── Panel ─────────────────────────────────────────── */

export function Panel({
  children,
  className,
  title,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className={cn("space-y-3 p-4", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}

/* ── Field ─────────────────────────────────────────── */

export function Field({
  label,
  children,
  error,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}

/* ── Input ─────────────────────────────────────────── */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-slate-100",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
          "placeholder:text-slate-500/80",
          "hover:border-white/[0.14] hover:bg-white/[0.05]",
          "focus:border-emerald-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none",
          "transition-all duration-200 ease-out",
          "disabled:cursor-not-allowed disabled:opacity-40",
          props.className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

/* ── TextArea ──────────────────────────────────────── */

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
        "transition-all duration-200 ease-out",
        "hover:border-white/[0.14] hover:bg-white/[0.05]",
        "focus-within:border-emerald-400/40 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.1),inset_0_1px_0_rgba(255,255,255,0.04)]",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40",
        className,
      )}
    >
      <textarea
        ref={ref}
        {...rest}
        className={cn(
          "w-full flex-1 resize-none rounded-2xl bg-transparent px-4 py-3 text-sm leading-relaxed text-slate-100",
          "placeholder:text-slate-500/60",
          "focus:outline-none",
          "disabled:cursor-not-allowed",
        )}
      />
    </div>
  );
});
TextArea.displayName = "TextArea";

/* ── Select ────────────────────────────────────────── */

export function Select({
  value,
  onValueChange,
  disabled,
  children,
  placeholder,
  className,
  icon,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-100",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
          "hover:border-white/[0.14] hover:bg-white/[0.05]",
          "focus:border-emerald-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none",
          "transition-all duration-200 ease-out",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "data-[placeholder]:text-slate-500",
          className,
        )}
      >
        {icon && <span className="text-emerald-400/60 shrink-0">{icon}</span>}
        <span className="truncate"><SelectPrimitive.Value placeholder={placeholder ?? "Select…"} /></span>
        <SelectPrimitive.Icon className="ml-auto shrink-0 text-slate-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            "relative z-50 max-h-72 min-w-[8rem] overflow-hidden",
            "rounded-xl border border-white/[0.1] bg-[#0b111d]/95 shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_12px_rgba(52,211,153,0.06)]",
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

export function SelectItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "relative flex items-center rounded-lg px-2.5 py-1.5 text-sm text-slate-300 outline-none cursor-pointer select-none",
        "data-[highlighted]:bg-emerald-400/10 data-[highlighted]:text-emerald-100",
        "data-[state=checked]:text-emerald-200",
        "transition-colors duration-100",
        className,
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ml-auto">
        <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

/* ── Checkbox ──────────────────────────────────────── */

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-[4px] border border-slate-300/35 bg-white/[0.04]",
        "data-[state=checked]:border-emerald-300/70 data-[state=checked]:bg-emerald-300/12",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30",
        "transition-all duration-200",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center text-emerald-100">
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.3">
          <path d="M3.5 8.5 6.8 11.5 12.5 4.8" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = "Checkbox";

/* ── Dialog ────────────────────────────────────────── */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/76 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-[14%] z-50 w-[min(92vw,760px)] -translate-x-1/2",
          "glass-card border-[var(--glass-border)] bg-[#0b111d]/95 p-0",
          "shadow-[0_24px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(52,211,153,0.08)]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ── Tabs ──────────────────────────────────────────── */

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-9 items-center rounded-lg border border-slate-300/18 bg-white/[0.04] p-0.5 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs text-slate-400 transition-all duration-200",
        "data-[state=active]:bg-emerald-300/10 data-[state=active]:text-emerald-100 data-[state=active]:shadow-sm",
        "hover:text-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("focus-visible:outline-none", className)}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

/* ── ScrollArea ────────────────────────────────────── */

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(function ScrollArea({ className, children, ...props }, ref) {
  return (
    <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner className="bg-transparent" />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar({ className, orientation = "vertical", ...props }, ref) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        "flex select-none touch-none p-0.5 transition-colors",
        orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-slate-400/35" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
});
ScrollBar.displayName = "ScrollBar";

/* ── Tooltip ───────────────────────────────────────── */

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-[#0b111d]/95 px-2.5 py-1.5 text-xs text-slate-200 shadow-glass backdrop-blur-sm",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = "TooltipContent";

/* ── Skeleton ──────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-slate-300/[0.06] animate-shimmer",
        className,
      )}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
        backgroundSize: "200% 100%",
      }}
    />
  );
}

/* ── EmptyState ────────────────────────────────────── */

export function EmptyState({
  title,
  detail,
  className,
}: {
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-panel rounded-xl px-4 py-5 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold tracking-tight text-slate-100">{title}</p>
      {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
    </div>
  );
}
