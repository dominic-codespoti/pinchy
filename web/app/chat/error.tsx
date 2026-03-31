"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, MessageSquare, WifiOff, ServerCrash } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ChatErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ChatError({ error, reset }: ChatErrorProps) {
  useEffect(() => {
    console.error("[Chat Error Boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      route: "/chat",
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";
  const isNetworkError = error.message.toLowerCase().includes('network') || 
                         error.message.toLowerCase().includes('fetch') ||
                         error.message.toLowerCase().includes('websocket');
  const isServerError = error.message.toLowerCase().includes('500') || 
                        error.message.toLowerCase().includes('server');

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-lg border-destructive/20">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              {isNetworkError ? (
                <WifiOff className="size-5 text-destructive" />
              ) : isServerError ? (
                <ServerCrash className="size-5 text-destructive" />
              ) : (
                <MessageSquare className="size-5 text-destructive" />
              )}
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">
                {isNetworkError ? 'Connection lost' : isServerError ? 'Server error' : 'Chat unavailable'}
              </CardTitle>
              <CardDescription>
                {isNetworkError 
                  ? 'Lost connection to the chat server. Messages may not be delivered.'
                  : isServerError
                  ? 'The chat server encountered an error. Please try again later.'
                  : 'There was a problem loading the chat interface.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive" className="border-destructive/50">
            <AlertCircle className="size-4" />
            <AlertTitle>Chat error</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-sm">{error.message || "Unable to load chat"}</p>
              {error.digest && (
                <p className="mt-2 text-xs font-mono opacity-70">
                  Error ID: {error.digest}
                </p>
              )}
            </AlertDescription>
          </Alert>

          {isDev && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Development Details</p>
              <div className="rounded-md bg-muted p-3">
                <pre className="text-xs overflow-auto max-h-32 font-mono text-muted-foreground">
                  {error.stack || "No stack trace available"}
                </pre>
              </div>
            </div>
          )}
        </CardContent>

        <Separator />

        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4">
          <Button
            variant="default"
            onClick={reset}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 size-4" />
            Retry connection
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 size-4" />
            Reload page
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/agents"}
            className="w-full sm:w-auto"
          >
            Go to agents
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
