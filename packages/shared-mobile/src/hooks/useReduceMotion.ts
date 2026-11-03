import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** The system's reduce-motion setting, or null until it has been read. */
export function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isCurrent) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      isCurrent = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
