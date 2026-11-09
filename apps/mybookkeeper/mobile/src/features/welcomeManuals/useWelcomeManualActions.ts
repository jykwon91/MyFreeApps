import { useDeleteWelcomeManualMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { useToast } from "@platform/mobile";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { useWrite } from "../../lib/useWrite";
import { removeFailure } from "./welcomeManualFailure";
import { MANUAL_WORDS } from "../../constants/welcomeManualSheets";

/** Deleting a manual from its own screen. A manual someone else already deleted counts as done. */
export function useWelcomeManualActions(manualId: string, onDeleted: () => void) {
  const { showToast } = useToast();
  const [deleteManual] = useDeleteWelcomeManualMutation();
  const removal = useWrite();

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteManual(manualId).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? WELCOME_MANUAL_MESSAGES.deleted : WELCOME_MANUAL_MESSAGES.alreadyDeleted);
  }

  const failure = removal.error && removal.failure !== "gone" ? removeFailure(removal.error, MANUAL_WORDS) : null;
  return { remove, isDeleting: removal.isBusy, failure };
}
