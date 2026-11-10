import { Alert } from "react-native";
import { DISCARD_MESSAGES } from "../constants/discard";
import { useConfirmLeave } from "./useConfirmLeave";

/** Asks before a form with unsaved changes closes. A save in flight can't be walked away from. */
export function useDiscardPrompt(hasUnsavedChanges: boolean, isBusy: boolean): void {
  useConfirmLeave(hasUnsavedChanges, (leave) => {
    if (isBusy) return;
    Alert.alert(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, [
      { text: DISCARD_MESSAGES.keepEditing, style: "cancel" },
      { text: DISCARD_MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });
}
