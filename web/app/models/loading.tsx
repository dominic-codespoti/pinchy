import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/shared/components/page-container";

export default function Loading() {
  return (
    <PageContainer className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-6" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Provider list skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </PageContainer>
  );
}
