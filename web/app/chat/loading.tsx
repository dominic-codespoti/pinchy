import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] overflow-hidden sm:-mx-6 lg:mx-0 lg:my-0 lg:h-[calc(100vh-3.5rem)]">
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
        <div className="flex-1 space-y-6 overflow-hidden px-3 py-3 sm:p-4">
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-16 w-[88%] max-w-md sm:w-3/4" />
          </div>
          {/* Agent message */}
          <div className="flex justify-start">
            <Skeleton className="h-24 w-[92%] max-w-lg sm:w-3/4" />
          </div>
          {/* User message */}
          <div className="flex justify-end">
            <Skeleton className="h-12 w-[72%] max-w-sm sm:w-2/3" />
          </div>
          {/* Agent message */}
          <div className="flex justify-start">
            <Skeleton className="h-32 w-[92%] max-w-lg sm:w-3/4" />
          </div>
        </div>

        {/* Input area skeleton */}
        <div className="border-t px-3 pb-2 pt-3 sm:p-4">
          <Skeleton className="h-20 w-full" />
        </div>
      </main>
    </div>
  );
}
