import { LoadingButton } from "@platform/ui";
import AlertBox from "@/shared/components/ui/AlertBox";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";

export interface ArchivedReplyTemplatesRetryProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function ArchivedReplyTemplatesRetry({ message, isRetrying, onRetry }: ArchivedReplyTemplatesRetryProps) {
  return (
    <AlertBox variant="error" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span role="alert">{message}</span>
      <LoadingButton
        variant="secondary"
        size="md"
        isLoading={isRetrying}
        loadingText={REPLY_TEMPLATE_MESSAGES.tryingAgain}
        onClick={onRetry}
      >
        {REPLY_TEMPLATE_MESSAGES.tryAgain}
      </LoadingButton>
    </AlertBox>
  );
}
