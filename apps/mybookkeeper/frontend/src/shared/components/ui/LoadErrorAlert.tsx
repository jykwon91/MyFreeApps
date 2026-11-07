import { AlertBox, LoadingButton } from "@platform/ui";

export interface LoadErrorAlertProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function LoadErrorAlert({ message, isRetrying, onRetry }: LoadErrorAlertProps) {
  return (
    <AlertBox variant="error" className="flex items-center justify-between gap-3">
      <span>{message}</span>
      <LoadingButton type="button" variant="secondary" size="sm" isLoading={isRetrying} loadingText="Retrying..." onClick={onRetry}>
        Retry
      </LoadingButton>
    </AlertBox>
  );
}
