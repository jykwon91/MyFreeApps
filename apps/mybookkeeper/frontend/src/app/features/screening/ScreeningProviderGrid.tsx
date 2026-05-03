import { useState } from "react";
import Skeleton from "@/shared/components/ui/Skeleton";
import { showError } from "@/shared/lib/toast-store";
import { useGetScreeningProvidersQuery, useLazyGetScreeningRedirectQuery } from "@/shared/store/screeningApi";
import ScreeningProviderCard from "./ScreeningProviderCard";

interface Props {
  applicantId: string;
  /** Override window.open — only used by tests. */
  openWindow?: (url: string) => void;
}

function ProviderGridSkeleton() {
  return (
    <div
      data-testid="screening-provider-grid-skeleton"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      aria-hidden="true"
    >
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-12 w-full rounded" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-8 w-28 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
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
export default function ScreeningProviderGrid({ applicantId, openWindow }: Props) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const { data, isLoading, isError } = useGetScreeningProvidersQuery(applicantId);
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

  if (isLoading) {
    return <ProviderGridSkeleton />;
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground italic" data-testid="screening-providers-error">
        I couldn't load the provider options. Please refresh the page and try again.
      </p>
    );
  }

  return (
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
  );
}
