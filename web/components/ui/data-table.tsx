"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  stickyHeader?: boolean;
  onRowClick?: (row: TData) => void;
  className?: string;
  pageSize?: number;
  enablePagination?: boolean;
}

interface SortButtonProps {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: (event: unknown) => void;
}

function SortButton({ label, sorted, onClick }: SortButtonProps) {
  const Icon = sorted === "asc" ? ChevronUp : sorted === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-8 -ml-2 font-medium data-[state=active]:bg-accent"
      data-state={sorted ? "active" : undefined}
    >
      {label}
      <Icon className={cn("ml-2 h-3.5 w-3.5", sorted && "text-primary")} />
    </Button>
  );
}

interface DataTableSkeletonProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  rowCount?: number;
}

function DataTableSkeleton<TData>({
  columns,
  rowCount = 5,
}: DataTableSkeletonProps<TData>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, i) => (
              <TableHead key={i} style={{ width: column.size ? `${column.size}px` : undefined }}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {columns.map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyState,
  stickyHeader = false,
  onRowClick,
  className,
  pageSize = 10,
  enablePagination = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  if (isLoading) {
    return <DataTableSkeleton columns={columns as ColumnDef<TData, unknown>[]} />;
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const headerGroups = table.getHeaderGroups();

  return (
    <div className={cn("rounded-md border", className)}>
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader
            className={cn(
              stickyHeader && "sticky top-0 z-10 bg-background shadow-sm"
            )}
          >
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {canSort ? (
                        <SortButton
                          label={flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          ) as string}
                          sorted={sorted}
                          onClick={header.column.getToggleSortingHandler() ?? (() => {})}
                        />
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    onRowClick && "cursor-pointer hover:bg-muted/50 transition-colors"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(row.original);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {enablePagination && data.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {table.getRowModel().rows.length} of {data.length} results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility to create column definitions with proper typing
export function createColumnHelper<TData>() {
  return {
    column: <TValue = unknown>(
      column: ColumnDef<TData, TValue>
    ): ColumnDef<TData, TValue> => column,
  };
}
