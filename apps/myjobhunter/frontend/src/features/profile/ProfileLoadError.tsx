import { useState } from "react";
import { AlertBox, LoadingButton } from "@platform/ui";
import type { ProfileLoadErrorProps } from "@/types/profile/profile-load-error-props";

/** Said in place of a list or the whole profile that failed to load, so a missing list is never read as an empty one. */
export default function ProfileLoadError({ title, message, onRetry }: ProfileLoadErrorProps) {
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
    <section className="border rounded-lg p-6 space-y-3">
      {title ? <h2 className="font-semibold">{title}</h2> : null}
      <AlertBox variant="error" role="alert" className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <LoadingButton variant="secondary" size="sm" isLoading={isRetrying} loadingText="Retrying…" onClick={() => void handleRetry()}>
          Try again
        </LoadingButton>
      </AlertBox>
    </section>
  );
}
