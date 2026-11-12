export interface CatalogLoadErrorProps {
  onRetry: () => Promise<void>;
  isRetrying: boolean;
}
