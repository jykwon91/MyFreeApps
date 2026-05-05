import { Component, type ReactNode, useState } from "react";
import { Coffee, ChevronDown, ChevronUp, Copy, Home, RotateCcw } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import api from "@/shared/lib/api";

export interface PageErrorBoundaryProps {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function ErrorDetails({ error }: { error: Error }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${error.name}: ${error.message}\n${error.stack ?? ""}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <div className="mt-3 relative">
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono text-muted-foreground overflow-x-auto max-h-[200px] text-left">
            {error.name}: {error.message}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy error details"
          >
            <Copy size={12} />
          </button>
          {copied && (
            <span className="absolute top-2 right-8 text-xs text-green-500">Copied</span>
          )}
        </div>
      )}
    </div>
  );
}

function PageErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  const handleGoHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8" role="alert">
      <div className="max-w-md text-center animate-in fade-in duration-300">
        <Coffee size={48} className="mx-auto mb-4 text-primary/40" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Well, that wasn't supposed to happen
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          I tripped over something on this page. The rest of the app should still
          be working fine — try heading somewhere else, or give this page another shot.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" size="sm" onClick={handleGoHome}>
            <Home size={14} className="mr-1.5" />
            Take me home
          </Button>
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw size={14} className="mr-1.5" />
            Try this page again
          </Button>
        </div>
        <ErrorDetails error={error} />
      </div>
    </div>
  );
}

export default class PageErrorBoundary extends Component<PageErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[PageErrorBoundary]", error.message, info.componentStack);
    api
      .post("/frontend-errors", {
        message: error.message,
        stack: error.stack ?? "",
        component_stack: info.componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      })
      .catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <PageErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
