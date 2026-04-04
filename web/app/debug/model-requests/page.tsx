"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageContainer } from "@/shared/components/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fetchApi } from "@/shared/api/client";
import { STALE_TIME, REFETCH_INTERVAL } from "@/lib/query-config";
import {
  type ModelRequest,
  type ModelRequestDetail,
} from "@/features/admin/types/model-requests";
import {
  Terminal,
  Clock,
  FileJson,
  ArrowLeft,
  Copy,
  Check,
} from "lucide-react";

interface ModelRequestsResponse {
  requests: ModelRequest[];
}

async function getModelRequests(): Promise<ModelRequestsResponse> {
  return fetchApi<ModelRequestsResponse>("/api/debug/model-requests");
}

async function getModelRequestDetail(
  requestId: string,
): Promise<ModelRequestDetail> {
  return fetchApi<ModelRequestDetail>(`/api/debug/model-requests/${requestId}`);
}

function formatTimestamp(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString();
}

function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function RequestList({
  requests,
  selectedId,
  onSelect,
}: {
  requests: ModelRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {requests.map((req) => (
        <button
          key={req.id}
          onClick={() => onSelect(req.id)}
          className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
            selectedId === req.id ? "bg-accent" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <code className="text-xs font-mono truncate">{req.id}</code>
            <Badge variant="outline" className="text-xs shrink-0">
              {req.provider}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{req.model}</span>
            <span>·</span>
            <span>
              {req.message_count} msg / {req.function_count} fn
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function RequestDetail({
  requestId,
  onBack,
}: {
  requestId: string;
  onBack: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["debug", "model-requests", requestId],
    queryFn: () => getModelRequestDetail(requestId),
    enabled: !!requestId,
    staleTime: STALE_TIME.NORMAL,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">Request not found</p>
        <Button variant="ghost" className="mt-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to list
        </Button>
      </div>
    );
  }

  const messagesJson = JSON.stringify(data.messages, null, 2);
  const functionsJson = JSON.stringify(data.functions, null, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Badge variant="outline">{data.provider}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Model</span>
          <p className="font-medium truncate">{data.model}</p>
        </div>
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Provider</span>
          <p className="font-medium">{data.provider}</p>
        </div>
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Time</span>
          <p className="font-medium">{formatTimestamp(data.timestamp)}</p>
        </div>
        <div className="rounded bg-muted p-2">
          <span className="text-muted-foreground">Tokens</span>
          <p className="font-medium">
            {formatTokenCount(data.estimated_tokens)} est
          </p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileJson className="h-4 w-4" />
            Messages ({data.message_count})
          </div>
          <CopyButton text={messagesJson} />
        </div>
        <ScrollArea className="h-48 rounded border">
          <pre className="p-3 text-xs font-mono bg-muted/30">
            {messagesJson}
          </pre>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileJson className="h-4 w-4" />
            Functions ({data.function_count})
          </div>
          <CopyButton text={functionsJson} />
        </div>
        <ScrollArea className="h-48 rounded border">
          <pre className="p-3 text-xs font-mono bg-muted/30">
            {functionsJson}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}

export default function DebugModelRequestsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["debug", "model-requests"],
    queryFn: getModelRequests,
    staleTime: STALE_TIME.SHORT,
    refetchInterval: REFETCH_INTERVAL.NORMAL,
  });

  return (
    <PageContainer className="space-y-6">
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5" />
        <h1 className="text-lg font-semibold">Debug Model Requests</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Requests
            </CardTitle>
            <CardDescription className="text-xs">
              {data?.requests?.length ?? 0} recorded
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100%-4rem)] px-3">
              {isLoading ? (
                <div className="space-y-2 px-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !data?.requests?.length ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Terminal className="h-8 w-8 mb-3 opacity-50" />
                  <p className="text-sm">No requests</p>
                </div>
              ) : (
                <RequestList
                  requests={data.requests}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              Payload
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedId ? (
              <RequestDetail
                requestId={selectedId}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileJson className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Select a request to view payload</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
