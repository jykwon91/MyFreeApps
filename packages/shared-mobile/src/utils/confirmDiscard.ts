import { Alert } from "react-native";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import type { DiscardCopy } from "@platform/core/types/discard/discard-copy";

/** Asks before unsaved work is thrown away. `onDiscard` runs only if the person says to discard it. */
export function confirmDiscard(onDiscard: () => void, copy: DiscardCopy = DISCARD_MESSAGES): void {
  Alert.alert(copy.discardTitle, copy.discardBody, [
    { text: copy.keepEditing, style: "cancel" },
    { text: copy.discard, style: "destructive", onPress: onDiscard },
  ]);
}
