import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/shared/components/page-container";

export default function Loading() {
  return (
    <PageContainer className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
      </div>

      {/* Stats section skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      {/* Two column layout skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>

      {/* Charts section skeleton */}
      <Skeleton className="h-80" />

      {/* Activity feed skeleton */}
      <Skeleton className="h-48" />
    </PageContainer>
  );
}
