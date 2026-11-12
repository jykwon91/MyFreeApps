import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { EmptyState } from "@platform/mobile";
import { CATALOG_MESSAGES } from "../../constants/catalog";
import type { CatalogLoadErrorProps } from "../../types/CatalogLoadErrorProps";

/** Where a list would be when it couldn't load, as the website's "Couldn't load your lessons." */
export default function CatalogLoadError({ onRetry, isRetrying }: CatalogLoadErrorProps) {
  return (
    <EmptyState
      action={{ label: CATALOG_COPY.retry, onPress: onRetry, isLoading: isRetrying }}
      body={CATALOG_MESSAGES.retryOffer}
      heading={CATALOG_COPY.loadFailed}
    />
  );
}
