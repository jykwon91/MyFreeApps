import { Alert } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";

/** Merging and keeping one delete a record for good, so the person says yes first. */
export function confirmDuplicateChange(kind: "merge" | "keep"): Promise<boolean> {
  const title = kind === "merge" ? MESSAGES.confirmMergeTitle : MESSAGES.confirmKeepTitle;
  const body = kind === "merge" ? MESSAGES.confirmMergeBody : MESSAGES.confirmKeepBody;
  const confirm = kind === "merge" ? MESSAGES.merge : MESSAGES.keepOnly;
  return new Promise((resolve) => {
    Alert.alert(
      title,
      body,
      [
        { text: MESSAGES.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: confirm, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
