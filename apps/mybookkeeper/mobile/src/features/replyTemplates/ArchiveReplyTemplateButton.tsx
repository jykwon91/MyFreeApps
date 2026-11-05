import { useArchiveReplyTemplate } from "@mybookkeeper/api-client/hooks/useArchiveReplyTemplate";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef } from "react";
import { ARCHIVE_FAILURE_MESSAGES, archiveTemplateTitle, REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/replyTemplates";
import { askOnce } from "../leases/askOnce";
import { leaveToList } from "./replyTemplateNavigation";

interface ArchiveReplyTemplateButtonProps {
  id: string;
  name: string;
  /** Called before leaving, so the screen doesn't flash "can't find" as the template drops out of the list. */
  onArchived: () => void;
}

export default function ArchiveReplyTemplateButton({ id, name, onArchived }: ArchiveReplyTemplateButtonProps) {
  const { showToast } = useToast();
  const asking = useRef(false);
  const { archive, isBusy } = useArchiveReplyTemplate((outcome) => {
    if (outcome === "done" || outcome === "gone") {
      onArchived();
      showToast(outcome === "done" ? MESSAGES.archived : MESSAGES.alreadyGone);
      leaveToList();
      return;
    }
    showToast(ARCHIVE_FAILURE_MESSAGES[outcome], "error");
  });

  return (
    <LoadingButton
      isLoading={isBusy}
      loadingText={MESSAGES.archiving}
      onPress={() =>
        askOnce(asking, archiveTemplateTitle(name), MESSAGES.archiveBody, {
          text: MESSAGES.archive,
          style: "destructive",
          onPress: () => void archive(id),
        })
      }
      variant="destructive"
    >
      {MESSAGES.archive}
    </LoadingButton>
  );
}
