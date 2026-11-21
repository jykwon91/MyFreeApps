import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import type { AnnouncementOptions } from "../types/AnnouncementOptions";
import type { AnnouncementPoliteness } from "../types/AnnouncementPoliteness";

/**
 * Has the screen reader read `message` when it appears or changes. Nothing else does this
 * on both platforms: `accessibilityLiveRegion` is Android-only, and `accessibilityRole`
 * ="alert" doesn't announce anything on iOS. A polite message is queued behind current speech
 * on iOS rather than cutting it off; Android always queues. With `onChangeOnly`, the message
 * shown on the first render is left unsaid.
 */
export function useAnnouncement(message: string | undefined, politeness: AnnouncementPoliteness = "assertive", { onChangeOnly = false }: AnnouncementOptions = {}): void {
  const unsaid = useRef(onChangeOnly ? message : undefined);
  useEffect(() => {
    if (!message) {
      unsaid.current = undefined;
      return;
    }
    if (message === unsaid.current) return;
    unsaid.current = undefined;
    if (politeness === "polite") AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    else AccessibilityInfo.announceForAccessibility(message);
  }, [message, politeness]);
}
