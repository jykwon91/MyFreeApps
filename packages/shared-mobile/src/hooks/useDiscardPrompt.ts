import { confirmDiscard } from "../utils/confirmDiscard";
import { useConfirmLeave } from "./useConfirmLeave";

/** Asks before a form with unsaved changes closes. A save in flight can't be walked away from. */
export function useDiscardPrompt(hasUnsavedChanges: boolean, isBusy: boolean): void {
  useConfirmLeave(hasUnsavedChanges, (leave) => {
    if (isBusy) return;
    confirmDiscard(leave);
  });
}
