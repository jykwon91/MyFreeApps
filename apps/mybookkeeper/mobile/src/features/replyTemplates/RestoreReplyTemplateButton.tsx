import { useRestoreReplyTemplate } from "@mybookkeeper/api-client/hooks/useRestoreReplyTemplate";
import { LoadingButton, useToast } from "@platform/mobile";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES, RESTORE_FAILURE_MESSAGES } from "../../constants/replyTemplates";
import { leaveToArchived } from "./replyTemplateNavigation";

interface RestoreReplyTemplateButtonProps {
  id: string;
  /** Called before leaving, so the screen doesn't flash "can't find" as the template drops out of the archived list. */
  onRestored: () => void;
}

export default function RestoreReplyTemplateButton({ id, onRestored }: RestoreReplyTemplateButtonProps) {
  const { showToast } = useToast();
  const { restore, isBusy } = useRestoreReplyTemplate(id, (outcome) => {
    if (outcome === "restored") {
      onRestored();
      showToast(MESSAGES.restored);
      // Back to where it was restored from: opening it here would leave the archived list under it.
      leaveToArchived();
      return;
    }
    showToast(RESTORE_FAILURE_MESSAGES[outcome], "error");
    if (outcome === "gone") leaveToArchived();
  });

  return (
    <LoadingButton isLoading={isBusy} loadingText={MESSAGES.restoring} onPress={() => void restore()}>
      {MESSAGES.restore}
    </LoadingButton>
  );
}
