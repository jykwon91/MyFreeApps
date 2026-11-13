import { Component, type ErrorInfo, type ReactNode } from "react";
import { NewVersionPrompt, StandaloneMain, announceUnlessReloading, isChunkLoadError } from "@platform/ui";

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
    announceUnlessReloading("ErrorBoundary", error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    // The fallback replaces the whole app, shell included, so it brings the
    // page's main landmark.
    return (
      <StandaloneMain>
        {/* A lazy route chunk that 404s after a deploy is not a bug in the page —
            the tab is running a replaced build. Offer the reload instead. */}
        {isChunkLoadError(this.state.error) ? (
          <NewVersionPrompt />
        ) : (
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
        )}
      </StandaloneMain>
    );
  }
}
