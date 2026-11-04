import { Alert } from "react-native";
import { UPLOAD_MESSAGES } from "../../constants/uploads";

export function confirmDiscard(onDiscard: () => void): void {
  Alert.alert(UPLOAD_MESSAGES.discardTitle, undefined, [
    { text: UPLOAD_MESSAGES.keepEditing, style: "cancel" },
    { text: UPLOAD_MESSAGES.discard, style: "destructive", onPress: onDiscard },
  ]);
}
