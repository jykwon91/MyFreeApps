import { LoadingButton, AlertBox } from "@platform/ui";
import { REPLY_TEMPLATE_MESSAGES } from "@/shared/lib/reply-template-messages";
import type { ReplyTemplatesRetryAnnounce } from "@/shared/types/inquiry/reply-templates-retry-announce";

export interface ReplyTemplatesRetryProps {
  message: string;
  announce: ReplyTemplatesRetryAnnounce;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function ReplyTemplatesRetry({ message, announce, isRetrying, onRetry }: ReplyTemplatesRetryProps) {
  return (
    <AlertBox variant="error" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span role={announce}>{message}</span>
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
