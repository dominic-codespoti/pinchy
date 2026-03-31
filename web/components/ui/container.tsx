"use client"

import * as React from "react"
import { cn } from "@/shared/lib/utils"

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "full" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl"
  center?: boolean
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = "full", center = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "w-full",
          size === "xl" && "max-w-xl",
          size === "2xl" && "max-w-2xl",
          size === "3xl" && "max-w-3xl",
          size === "4xl" && "max-w-4xl",
          size === "5xl" && "max-w-5xl",
          size === "6xl" && "max-w-6xl",
          size === "7xl" && "max-w-7xl",
          center && "mx-auto",
          className
        )}
        {...props}
      />
    )
  }
)
Container.displayName = "Container"
