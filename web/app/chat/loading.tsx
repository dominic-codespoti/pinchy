import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Desktop Sidebar skeleton */}
      <aside className="hidden lg:flex w-72 flex-col border-r bg-background p-4 space-y-4">
        {/* Search/Filter */}
        <Skeleton className="h-10 w-full" />
        {/* Agent list header */}
        <Skeleton className="h-6 w-24" />
        {/* Session items */}
        <div className="space-y-2 flex-1">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        {/* New chat button */}
        <Skeleton className="h-10 w-full" />
      </aside>

      {/* Main Chat Area skeleton */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header skeleton */}
        <div className="flex items-center justify-between border-b p-4 gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 lg:hidden" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>

        {/* Message list skeleton */}
        <div className="flex-1 p-4 space-y-6 overflow-hidden">
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-16 w-3/4 max-w-md" />
          </div>
          {/* Agent message */}
          <div className="flex justify-start">
            <Skeleton className="h-24 w-3/4 max-w-lg" />
          </div>
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-12 w-2/3 max-w-sm" />
          </div>
          {/* Agent message */}
          <div className="flex justify-start">
            <Skeleton className="h-32 w-3/4 max-w-lg" />
          </div>
        </div>

        {/* Input area skeleton */}
        <div className="border-t p-4">
          <Skeleton className="h-20 w-full" />
        </div>
      </main>
    </div>
  );
}
