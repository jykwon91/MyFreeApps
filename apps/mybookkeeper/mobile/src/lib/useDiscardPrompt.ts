import { Alert } from "react-native";
import { FORM_MESSAGES } from "../constants/forms";
import { useConfirmLeave } from "./useConfirmLeave";

/** Asks before a form with unsaved changes closes. A save in flight can't be walked away from. */
export function useDiscardPrompt(hasUnsavedChanges: boolean, isBusy: boolean): void {
  useConfirmLeave(hasUnsavedChanges, (leave) => {
    if (isBusy) return;
    Alert.alert(FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody, [
      { text: FORM_MESSAGES.keepEditing, style: "cancel" },
      { text: FORM_MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });
}
