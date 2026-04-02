import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/shared/components/page-container";

export default function Loading() {
  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Skeleton className="h-9 w-full sm:w-24" />
          <Skeleton className="h-9 w-full sm:w-28" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="space-y-3">
        {/* Table header */}
        <Skeleton className="h-10" />
        {/* Table rows */}
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </PageContainer>
  );
}
