import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useRestoreReplyTemplate } from "@mybookkeeper/api-client/hooks/useRestoreReplyTemplate";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES, RESTORE_FAILURE_MESSAGES, restoreLabel } from "@/shared/lib/reply-template-messages";

export interface RestoreReplyTemplateButtonProps {
  template: ReplyTemplate;
  /** Called once it's restored, before its row leaves the list, so focus has somewhere to go. */
  onRestored: () => void;
}

export default function RestoreReplyTemplateButton({ template, onRestored }: RestoreReplyTemplateButtonProps) {
  const { restore, isBusy } = useRestoreReplyTemplate(template.id, (outcome) => {
    if (outcome !== "done") {
      showError(RESTORE_FAILURE_MESSAGES[outcome]);
      return;
    }
    onRestored();
    showSuccess(MESSAGES.restored);
  });

  return (
    <LoadingButton
      variant="secondary"
      size="md"
      isLoading={isBusy}
      loadingText={MESSAGES.restoring}
      onClick={() => void restore()}
      aria-label={restoreLabel(template.name)}
      className="w-full sm:w-auto"
      data-testid={`reply-template-restore-${template.id}`}
    >
      {MESSAGES.restore}
    </LoadingButton>
  );
}
