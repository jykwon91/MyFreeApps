import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import { DOCUMENTS_LIST_MESSAGES as MESSAGES } from "@/constants/documents-list-messages";

export interface DocumentListErrorProps {
  onRetry: () => Promise<unknown>;
}

export default function DocumentListError({ onRetry }: DocumentListErrorProps) {
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
      <p className="text-sm text-destructive">{MESSAGES.couldntLoad}</p>
      <LoadingButton
        variant="secondary"
        isLoading={isRetrying}
        loadingText="Retrying..."
        onClick={() => void handleRetry()}
        className="min-h-[44px]"
      >
        {MESSAGES.retry}
      </LoadingButton>
    </div>
  );
}
