import { ErrorBoundary as SolidErrorBoundary, type ParentProps } from "solid-js";
import { RefreshCw } from "@/components/icons";

/**
 * App-level error boundary. Catches unhandled render errors
 * and shows a recovery UI with a retry button.
 */
export function ErrorBoundary(props: ParentProps) {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <div class="error-boundary">
          <div class="error-boundary-content">
            <div class="error-boundary-icon">!</div>
            <h2 class="error-boundary-title">Something went wrong</h2>
            <p class="error-boundary-message">
              {err instanceof Error ? err.message : String(err)}
            </p>
            <button class="btn btn-primary" onClick={reset}>
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
