import { useState } from "react";
import { LoadingButton } from "@platform/ui";

export interface ListLoadErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => Promise<unknown>;
}

/** A list that couldn't load at all: says so, with a retry that shows it's working. */
export default function ListLoadError({ message, retryLabel, onRetry }: ListLoadErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <p className="text-sm text-destructive">{message}</p>
      <LoadingButton
        variant="secondary"
        isLoading={isRetrying}
        loadingText="Retrying..."
        onClick={() => void handleRetry()}
        className="min-h-[44px]"
      >
        {retryLabel}
      </LoadingButton>
    </div>
  );
}
