import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  readonly children: React.ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Class-based error boundary (React requires class components for
 * `componentDidCatch`). Catches render errors in child tree and
 * displays a recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            Something went wrong
          </h2>
          <p className="max-w-md text-xs text-muted-foreground">
            {error.message}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={this.handleReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }
}
