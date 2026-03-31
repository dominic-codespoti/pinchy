"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home, WifiOff, ServerCrash } from "lucide-react";
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

interface RootErrorProps {
  error: Error & { digest?: string; statusCode?: number };
  reset: () => void;
}

function getErrorIcon(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return <WifiOff className="size-5 text-destructive" />;
  }
  if (message.includes('500') || message.includes('server') || message.includes('internal')) {
    return <ServerCrash className="size-5 text-destructive" />;
  }
  return <AlertCircle className="size-5 text-destructive" />;
}

function getErrorTitle(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'Connection failed';
  }
  if (message.includes('500') || message.includes('server')) {
    return 'Server error';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'Page not found';
  }
  if (message.includes('403') || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'Access denied';
  }
  return 'Something went wrong';
}

function getErrorDescription(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
  if (message.includes('500') || message.includes('server')) {
    return 'The server encountered an error. Please try again later.';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'The page you\'re looking for doesn\'t exist.';
  }
  if (message.includes('403') || message.includes('unauthorized')) {
    return 'You don\'t have permission to access this resource.';
  }
  return 'We\'ve encountered an unexpected error.';
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error("[Root Error Boundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";
  const isNetworkError = error.message.toLowerCase().includes('network') || 
                         error.message.toLowerCase().includes('fetch');

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-destructive/20">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              {getErrorIcon(error)}
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">{getErrorTitle(error)}</CardTitle>
              <CardDescription>{getErrorDescription(error)}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive" className="border-destructive/50">
            <AlertCircle className="size-4" />
            <AlertTitle>Error details</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-sm">{error.message || "An unexpected error occurred"}</p>
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
                <pre className="text-xs overflow-auto max-h-48 font-mono text-muted-foreground">
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
            Try again
          </Button>
          {isNetworkError && (
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="mr-2 size-4" />
              Reload page
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
            className="w-full sm:w-auto"
          >
            <Home className="mr-2 size-4" />
            Go home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
