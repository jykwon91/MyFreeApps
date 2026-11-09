import { Alert } from "react-native";
import { FORM_MESSAGES } from "../constants/forms";

/** Asks before a form with unsaved changes closes. */
export function confirmDiscard(onDiscard: () => void): void {
  Alert.alert(FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody, [
    { text: FORM_MESSAGES.keepEditing, style: "cancel" },
    { text: FORM_MESSAGES.discard, style: "destructive", onPress: onDiscard },
  ]);
}
