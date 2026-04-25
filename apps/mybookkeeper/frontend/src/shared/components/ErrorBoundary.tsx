import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
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
