export interface ResumeUnsentCardProps {
  name: string;
  isRetrying: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}
