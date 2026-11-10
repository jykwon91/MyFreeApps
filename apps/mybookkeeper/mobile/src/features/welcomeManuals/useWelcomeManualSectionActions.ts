import { useDeleteSectionMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { useToast } from "@platform/mobile";
import { WELCOME_MANUAL_SECTION_MESSAGES } from "../../constants/welcomeManualForms";
import { useWrite } from "../../lib/useWrite";
import { removeFailure } from "./welcomeManualFailure";
import { SECTION_WORDS } from "../../constants/welcomeManualSheets";

/** Deleting a section from its own screen. One already deleted elsewhere counts as done. */
export function useWelcomeManualSectionActions(manualId: string, sectionId: string, onDeleted: () => void) {
  const { showToast } = useToast();
  const [deleteSection] = useDeleteSectionMutation();
  const removal = useWrite();

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteSection({ manualId, sectionId }).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? WELCOME_MANUAL_SECTION_MESSAGES.deleted : WELCOME_MANUAL_SECTION_MESSAGES.alreadyDeleted);
  }

  return { remove, isDeleting: removal.isBusy, failure: removal.error && removal.failure !== "gone" ? removeFailure(removal.error, SECTION_WORDS) : null };
}
