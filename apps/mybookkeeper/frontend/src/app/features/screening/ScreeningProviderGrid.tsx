import { useState } from "react";
import { showError } from "@platform/ui";
import { useGetScreeningProvidersQuery, useLazyGetScreeningRedirectQuery } from "@mybookkeeper/api-client/store/screeningApi";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";
import ScreeningProviderCard from "./ScreeningProviderCard";
import ScreeningProviderGridSkeleton from "./ScreeningProviderGridSkeleton";
import ScreeningInlineRetry from "./ScreeningInlineRetry";

export interface ScreeningProviderGridProps {
  applicantId: string;
  /** Override window.open — only used by tests. */
  openWindow?: (url: string) => void;
}

/**
 * Provider selection grid — fetches static provider metadata from the backend
 * and renders a card for each available provider.
 *
 * On provider selection:
 *   1. Fetches the redirect URL for that specific provider.
 *   2. Opens it in a new tab (noopener, noreferrer).
 *   3. Falls back with a popup-blocked toast if window.open returns null.
 *
 * All provider cards are disabled while any single redirect fetch is in
 * flight — prevents race conditions from rapid multi-clicks.
 */
export default function ScreeningProviderGrid({ applicantId, openWindow }: ScreeningProviderGridProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const { currentData: data, error, isFetching, refetch } = useGetScreeningProvidersQuery(applicantId);
  const mode = resolveDetailLoadMode({ hasData: data !== undefined, hasError: error !== undefined });
  const [triggerRedirect] = useLazyGetScreeningRedirectQuery();

  async function handleSelectProvider(providerName: string) {
    setLoadingProvider(providerName);
    try {
      const result = await triggerRedirect({ applicantId, provider: providerName }).unwrap();
      const url = result.redirect_url;

      if (openWindow) {
        openWindow(url);
        return;
      }

      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        showError(
          "I couldn't open the screening dashboard — please unblock popups for this site and try again.",
        );
      }
    } catch {
      showError("I couldn't open the screening dashboard right now. Please try again in a moment.");
    } finally {
      setLoadingProvider(null);
    }
  }

  if (mode === "loading") {
    return <ScreeningProviderGridSkeleton />;
  }

  // Decided on `error`, not `isError`: RTK clears `isError` while Retry
  // refetches, which would drop the message before the providers arrive.
  return (
    <div className="space-y-3">
      {error ? (
        <ScreeningInlineRetry
          message="I couldn't load the provider options."
          isRetrying={isFetching}
          onRetry={() => void refetch()}
          testId="screening-providers-error"
          retryTestId="screening-providers-retry"
        />
      ) : null}
      {data ? (
        <div
          data-testid="screening-provider-grid"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {data.providers.map((provider) => (
            <ScreeningProviderCard
              key={provider.name}
              provider={provider}
              isLoading={loadingProvider === provider.name}
              onSelect={handleSelectProvider}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
