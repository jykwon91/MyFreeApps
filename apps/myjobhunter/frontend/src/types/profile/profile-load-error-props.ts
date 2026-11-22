export interface ProfileLoadErrorProps {
  /** The section's heading; left out when the whole profile failed. */
  title?: string;
  message: string;
  onRetry: () => unknown;
}
