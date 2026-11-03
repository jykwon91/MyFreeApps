import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Has the screen reader read `message` when it appears or changes. Nothing else does this
 * on both platforms: `accessibilityLiveRegion` is Android-only, and `accessibilityRole`
 * ="alert" doesn't announce anything on iOS.
 */
export function useAnnouncement(message: string | undefined): void {
  useEffect(() => {
    if (message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
}
