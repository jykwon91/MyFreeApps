import { Component, type ErrorInfo, type ReactNode } from "react";
import { NewVersionPrompt, isChunkLoadError } from "@platform/ui";

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render(): ReactNode {
    // A lazy route chunk that 404s after a deploy is not a bug in the page —
    // the tab is running a replaced build. Offer the reload instead.
    if (this.state.error && isChunkLoadError(this.state.error)) {
      return <NewVersionPrompt />;
    }
    if (this.state.error) {
      return (
        <div className="p-8 text-center space-y-2">
          <p className="text-lg font-medium text-destructive">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-sm underline text-muted-foreground"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
