export interface ScreeningInlineRetryProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
  testId: string;
  retryTestId: string;
}

/** A quiet "couldn't load X — Retry" line, sized to sit inside the screening section. */
export default function ScreeningInlineRetry({ message, isRetrying, onRetry, testId, retryTestId }: ScreeningInlineRetryProps) {
  return (
    <div className="text-xs text-muted-foreground italic flex items-center gap-3" data-testid={testId}>
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="text-primary hover:underline min-h-[44px]"
        data-testid={retryTestId}
      >
        {isRetrying ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}
