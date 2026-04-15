"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for layout-level errors.
 * This renders outside the root layout, so it cannot use the app's
 * providers, navigation, or global styles. Keep it self-contained.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error("Global error boundary caught:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-lg space-y-4">
            {/* Icon header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="size-8 text-destructive" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Critical Error
                </h1>
                <p className="text-muted-foreground">
                  The application failed to load
                </p>
              </div>
            </div>

            {/* Error alert */}
            <Alert
              variant="destructive"
              className="border-destructive/50 bg-destructive/5"
            >
              <AlertCircle className="size-4" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="text-sm">
                  {error.message || "A critical error occurred while loading the application"}
                </p>
                {error.digest && (
                  <p className="mt-2 text-xs font-mono opacity-70">
                    Error ID: {error.digest}
                  </p>
                )}
              </AlertDescription>
            </Alert>

            {/* Dev stack trace */}
            {isDev && (
              <div className="rounded-md bg-muted p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Stack Trace (Development Only)
                </p>
                <pre className="text-xs overflow-auto max-h-64 font-mono text-muted-foreground whitespace-pre-wrap break-all">
                  {error.stack || "No stack trace available"}
                </pre>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="default"
                onClick={reset}
                size="lg"
                className="w-full"
              >
                <RefreshCw />
                Reload Application
              </Button>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-muted-foreground">
              If the problem persists, please check the console for more details
              {isDev && " or review the stack trace above"}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
