import { useGetArchivedReplyTemplatesQuery, useUpdateReplyTemplateMutation } from "@mybookkeeper/api-client/store/inquiriesApi";
import { LoadingButton, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/replyTemplates";
import { checkStillListed } from "./checkStillListed";
import { restoreFailure } from "./replyTemplateFailure";
import { leaveToArchived } from "./replyTemplateNavigation";

interface RestoreReplyTemplateButtonProps {
  id: string;
  /** Called before leaving, so the screen doesn't flash "can't find" as the template drops out of the archived list. */
  onRestored: () => void;
}

export default function RestoreReplyTemplateButton({ id, onRestored }: RestoreReplyTemplateButtonProps) {
  const { showToast } = useToast();
  const [updateTemplate] = useUpdateReplyTemplateMutation();
  const { refetch } = useGetArchivedReplyTemplatesQuery();
  const [isBusy, setIsBusy] = useState(false);
  const busy = useRef(false);

  function finish(): void {
    onRestored();
    showToast(MESSAGES.restored);
    // Back to where it was restored from: opening it here would leave the archived list under it.
    leaveToArchived();
  }

  async function checkWhatHappened(): Promise<void> {
    const check = await checkStillListed(refetch, id);
    if (check === "unsure") showToast(MESSAGES.restoreUnsure, "error");
    else if (check === "stillListed") showToast(MESSAGES.restoreStillArchived, "error");
    else finish();
  }

  async function restore(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    try {
      await updateTemplate({ id, data: { is_archived: false } }).unwrap();
      finish();
    } catch (error) {
      const failure = restoreFailure(error);
      if (failure === "gone") {
        showToast(MESSAGES.goneAnymore, "error");
        leaveToArchived();
        void refetch();
      } else if (failure === "viewOnly") showToast(MESSAGES.restoreViewOnly, "error");
      else if (failure === "noResponse" || failure === "serverError") await checkWhatHappened();
      else showToast(MESSAGES.restoreFailed, "error");
    } finally {
      busy.current = false;
      setIsBusy(false);
    }
  }

  return (
    <LoadingButton isLoading={isBusy} loadingText={MESSAGES.restoring} onPress={() => void restore()}>
      {MESSAGES.restore}
    </LoadingButton>
  );
}
