export interface SectionErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => void | Promise<void>;
}
