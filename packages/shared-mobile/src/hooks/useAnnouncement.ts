import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import type { AnnouncementPoliteness } from "../types/AnnouncementPoliteness";

/**
 * Has the screen reader read `message` when it appears or changes. Nothing else does this
 * on both platforms: `accessibilityLiveRegion` is Android-only, and `accessibilityRole`
 * ="alert" doesn't announce anything on iOS. A polite message is queued behind current speech
 * on iOS rather than cutting it off; Android always queues.
 */
export function useAnnouncement(message: string | undefined, politeness: AnnouncementPoliteness = "assertive"): void {
  useEffect(() => {
    if (!message) return;
    if (politeness === "polite") AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    else AccessibilityInfo.announceForAccessibility(message);
  }, [message, politeness]);
}
