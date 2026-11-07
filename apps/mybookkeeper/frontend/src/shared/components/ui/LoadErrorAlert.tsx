import { LoadingButton } from "@platform/ui";
import AlertBox from "@/shared/components/ui/AlertBox";

export interface LoadErrorAlertProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function LoadErrorAlert({ message, isRetrying, onRetry }: LoadErrorAlertProps) {
  return (
    <AlertBox variant="error" className="flex items-center justify-between gap-3">
      <span>{message}</span>
      <LoadingButton variant="secondary" size="sm" isLoading={isRetrying} loadingText="Retrying..." onClick={onRetry}>
        Retry
      </LoadingButton>
    </AlertBox>
  );
}
