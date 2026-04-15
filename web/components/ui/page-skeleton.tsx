'use client';

import { PageContainer } from '@/shared/components/page-container';
import { Skeleton } from './skeleton';
import { cn } from '@/shared/lib/utils';

export interface PageSkeletonProps {
  /** Whether to show header skeleton (title + optional description + action buttons) */
  header?: boolean;
  /** Number of content rows to show */
  contentRows?: number;
  /** Height of each content row */
  rowHeight?: 'sm' | 'md' | 'lg' | number;
  /** Whether to show table header skeleton */
  tableHeader?: boolean;
  /** Whether to wrap in PageContainer */
  container?: boolean;
  /** Additional className */
  className?: string;
}

const rowHeightMap = {
  sm: 'h-10',
  md: 'h-14',
  lg: 'h-16',
};

/**
 * Generic page loading skeleton component.
 * Used across the application for consistent loading UI.
 */
export function PageSkeleton({
  header = true,
  contentRows = 5,
  rowHeight = 'md',
  tableHeader = true,
  container = true,
  className,
}: PageSkeletonProps) {
  const heightClass =
    typeof rowHeight === 'number' ? `h-[${rowHeight}px]` : rowHeightMap[rowHeight];

  const content = (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
      {header && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Skeleton className="h-9 w-full sm:w-28" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {tableHeader && <Skeleton className="h-10" />}
        {Array.from({ length: contentRows }).map((_, i) => (
          <Skeleton key={i} className={cn('w-full', heightClass)} />
        ))}
      </div>
    </div>
  );

  if (container) {
    return <PageContainer>{content}</PageContainer>;
  }

  return content;
}

PageSkeleton.displayName = 'PageSkeleton';

/**
 * Card grid skeleton for pages with card-based layouts
 */
export interface CardGridSkeletonProps {
  /** Number of cards to show */
  count?: number;
  /** Height of each card */
  cardHeight?: 'sm' | 'md' | 'lg' | number;
  /** Number of columns (responsive) */
  columns?: 1 | 2 | 3 | 4;
  /** Whether to wrap in PageContainer */
  container?: boolean;
  /** Whether to show header skeleton */
  header?: boolean;
  /** Additional className */
  className?: string;
}

const cardHeightMap = {
  sm: 'h-24',
  md: 'h-36',
  lg: 'h-48',
};

const columnsMap = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export function CardGridSkeleton({
  count = 6,
  cardHeight = 'md',
  columns = 3,
  container = true,
  header = true,
  className,
}: CardGridSkeletonProps) {
  const heightClass =
    typeof cardHeight === 'number' ? `h-[${cardHeight}px]` : cardHeightMap[cardHeight];

  const content = (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
      {header && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      )}

      <div className={cn('grid gap-4', columnsMap[columns])}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className={cn('w-full', heightClass)} />
        ))}
      </div>
    </div>
  );

  if (container) {
    return <PageContainer>{content}</PageContainer>;
  }

  return content;
}

CardGridSkeleton.displayName = 'CardGridSkeleton';
