import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** An on/off system setting, or null until it has been read (or if it can't be). */
export function useAccessibilitySetting(
  event: "reduceMotionChanged" | "screenReaderChanged",
  read: () => Promise<boolean>,
): boolean | null {
  const [isOn, setIsOn] = useState<boolean | null>(null);

  useEffect(() => {
    let isSettled = false;
    const subscription = AccessibilityInfo.addEventListener(event, (enabled: boolean) => {
      isSettled = true;
      setIsOn(enabled);
    });
    read().then(
      (enabled) => {
        if (!isSettled) setIsOn(enabled);
      },
      () => {
        // Null already means "unknown", and callers treat that as the cautious case.
      },
    );
    return () => {
      isSettled = true;
      subscription.remove();
    };
  }, [event, read]);

  return isOn;
}
