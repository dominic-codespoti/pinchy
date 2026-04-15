import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4">
      {/* Header Card skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </CardHeader>
      </Card>

      {/* Filter bar Card skeleton */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Level filter buttons */}
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-16" />
            </div>
            {/* Search and actions */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-full sm:w-64" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log display Card skeleton */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full p-4">
          <div className="space-y-2">
            {/* Log entry rows */}
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
