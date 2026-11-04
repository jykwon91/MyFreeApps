import type { RefObject } from "react";
import { Alert } from "react-native";
import { LEASE_MESSAGES } from "../../constants/leases";

/** A second tap before the question appears would otherwise ask twice. */
export function askOnce(
  asking: RefObject<boolean>,
  title: string,
  body: string,
  confirm: { text: string; style?: "destructive"; onPress: () => void },
): void {
  if (asking.current) return;
  asking.current = true;
  const release = () => {
    asking.current = false;
  };
  Alert.alert(
    title,
    body,
    [
      { text: LEASE_MESSAGES.cancel, style: "cancel", onPress: release },
      {
        ...confirm,
        onPress: () => {
          release();
          confirm.onPress();
        },
      },
    ],
    { cancelable: true, onDismiss: release },
  );
}
