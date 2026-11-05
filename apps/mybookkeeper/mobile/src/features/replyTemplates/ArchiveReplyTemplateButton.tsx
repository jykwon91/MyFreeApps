import { useArchiveReplyTemplateMutation, useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { archiveTemplateTitle, REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/replyTemplates";
import { askOnce } from "../leases/askOnce";
import { checkStillListed } from "./checkStillListed";
import { archiveFailure } from "./replyTemplateFailure";
import { leaveToList } from "./replyTemplateNavigation";

interface ArchiveReplyTemplateButtonProps {
  id: string;
  name: string;
  /** Called before leaving, so the screen doesn't flash "can't find" as the template drops out of the list. */
  onArchived: () => void;
}

export default function ArchiveReplyTemplateButton({ id, name, onArchived }: ArchiveReplyTemplateButtonProps) {
  const { showToast } = useToast();
  const [archiveTemplate] = useArchiveReplyTemplateMutation();
  const { refetch } = useGetReplyTemplatesQuery();
  const [isBusy, setIsBusy] = useState(false);
  const asking = useRef(false);

  function finish(): void {
    onArchived();
    showToast(MESSAGES.archived);
    leaveToList();
  }

  function goneAlready(): void {
    finish();
    // The list still has it.
    void refetch();
  }

  async function checkWhatHappened(): Promise<void> {
    const check = await checkStillListed(refetch, id);
    if (check === "unsure") showToast(MESSAGES.archiveUnsure, "error");
    else if (check === "stillListed") showToast(MESSAGES.archiveUnreachable, "error");
    else finish();
  }

  async function confirmed(): Promise<void> {
    setIsBusy(true);
    try {
      await archiveTemplate(id).unwrap();
      finish();
    } catch (error) {
      const failure = archiveFailure(error);
      if (failure === "gone") goneAlready();
      else if (failure === "viewOnly") showToast(MESSAGES.archiveViewOnly, "error");
      else if (failure === "noResponse") await checkWhatHappened();
      else showToast(MESSAGES.archiveFailed, "error");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <LoadingButton
      isLoading={isBusy}
      loadingText={MESSAGES.archiving}
      onPress={() =>
        askOnce(asking, archiveTemplateTitle(name), MESSAGES.archiveBody, {
          text: MESSAGES.archive,
          style: "destructive",
          onPress: () => void confirmed(),
        })
      }
      variant="destructive"
    >
      {MESSAGES.archive}
    </LoadingButton>
  );
}
