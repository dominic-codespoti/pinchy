"use client";

import { useState } from "react";
import Link from "next/link";
import { Bug, Clock, Database, ArrowRight, X, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useModelRequests, useModelRequestDetail } from "../hooks";

function formatTimestamp(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString();
}

function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function RequestDetail({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useModelRequestDetail(requestId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">Request not found.</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{data.id}</p>
          <p className="text-xs text-muted-foreground">
            {formatTimestamp(data.timestamp)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Model</span>
          <p className="font-medium truncate">{data.model}</p>
        </div>
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Provider</span>
          <p className="font-medium">{data.provider}</p>
        </div>
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Tokens</span>
          <p className="font-medium">
            {formatTokenCount(data.estimated_tokens)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Messages ({data.message_count})</p>
        <ScrollArea className="h-48 rounded border bg-muted/50">
          <pre className="p-3 text-xs">
            {JSON.stringify(data.messages, null, 2)}
          </pre>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Functions ({data.function_count})</p>
        <ScrollArea className="h-48 rounded border bg-muted/50">
          <pre className="p-3 text-xs">
            {JSON.stringify(data.functions, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}

function RequestsTable({
  requests,
  selectedId,
  onSelect,
}: {
  requests: Array<{
    id: string;
    model: string;
    provider: string;
    timestamp: string | number;
    estimated_tokens: number;
    message_count: number;
    function_count: number;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">ID</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="hidden sm:table-cell">Provider</TableHead>
          <TableHead className="hidden md:table-cell">Time</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="hidden sm:table-cell text-right">
            Messages
          </TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => (
          <TableRow
            key={req.id}
            className={selectedId === req.id ? "bg-muted" : "cursor-pointer"}
            onClick={() => onSelect(req.id)}
          >
            <TableCell className="font-mono text-xs">{req.id}</TableCell>
            <TableCell className="text-sm">{req.model}</TableCell>
            <TableCell className="hidden sm:table-cell">
              <Badge variant="outline" className="text-xs">
                {req.provider}
              </Badge>
            </TableCell>
            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
              {formatTimestamp(req.timestamp)}
            </TableCell>
            <TableCell className="text-right text-xs">
              {formatTokenCount(req.estimated_tokens)} est
            </TableCell>
            <TableCell className="hidden sm:table-cell text-right text-xs text-muted-foreground">
              {req.message_count} msg / {req.function_count} fn
            </TableCell>
            <TableCell>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RequestsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ModelRequestsTab() {
  const { data, isLoading } = useModelRequests();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            Model Requests
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/debug/model-requests">
              <ExternalLink className="h-4 w-4 mr-2" />
              Full View
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <RequestsSkeleton />
            </div>
          ) : !data?.requests?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bug className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No model requests recorded
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <RequestsTable
                requests={data.requests}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Request Detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedId ? (
            <RequestDetail
              requestId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <ArrowRight className="h-8 w-8 mb-3 opacity-50" />
              <p className="text-sm">Select a request to inspect</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
