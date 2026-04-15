"use client"

import * as React from "react"
import { cn } from "@/shared/lib/utils"

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "vertical" | "horizontal"
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  align?: "start" | "center" | "end" | "stretch"
  justify?: "start" | "center" | "end" | "between" | "around"
  wrap?: boolean
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, direction = "vertical", gap = 4, align, justify, wrap, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          direction === "vertical" ? "flex-col" : "flex-row",
          gap === 0 && "gap-0",
          gap === 1 && "gap-1",
          gap === 2 && "gap-2",
          gap === 3 && "gap-3",
          gap === 4 && "gap-4",
          gap === 5 && "gap-5",
          gap === 6 && "gap-6",
          gap === 8 && "gap-8",
          gap === 10 && "gap-10",
          gap === 12 && "gap-12",
          align === "start" && "items-start",
          align === "center" && "items-center",
          align === "end" && "items-end",
          align === "stretch" && "items-stretch",
          justify === "start" && "justify-start",
          justify === "center" && "justify-center",
          justify === "end" && "justify-end",
          justify === "between" && "justify-between",
          justify === "around" && "justify-around",
          wrap && "flex-wrap",
          className
        )}
        {...props}
      />
    )
  }
)
Stack.displayName = "Stack"

// Convenience exports
export const VStack = ({ className, ...props }: Omit<StackProps, "direction">) => (
  <Stack direction="vertical" className={className} {...props} />
)

export const HStack = ({ className, ...props }: Omit<StackProps, "direction">) => (
  <Stack direction="horizontal" className={className} {...props} />
)

export const FlexBetween = ({ className, ...props }: Omit<StackProps, "direction" | "justify">) => (
  <Stack direction="horizontal" justify="between" align="center" className={className} {...props} />
)
