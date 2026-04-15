import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/shared/components/page-container";

export default function Loading() {
  return (
    <PageContainer className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex flex-col sm:flex-row gap-2">
          <Skeleton className="h-9 w-full sm:w-32" />
          <Skeleton className="h-9 w-full sm:w-24" />
          <Skeleton className="h-9 w-full sm:w-28" />
        </div>
      </div>

      {/* Main content area with sidebar layout */}
      <div className="flex gap-6">
        {/* Sidebar skeleton */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        </aside>

        {/* Table area skeleton */}
        <main className="flex-1 min-w-0">
          <div className="space-y-3">
            {/* Table header */}
            <Skeleton className="h-10" />
            {/* Table rows */}
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </main>
      </div>
    </PageContainer>
  );
}
