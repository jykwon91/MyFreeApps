import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Has the screen reader read `message` once it has stopped changing for `delayMs`. Android
 * reads a live region by itself; iOS doesn't, and reading every keystroke would talk over
 * the typing. Pass undefined to say nothing.
 */
export function useDebouncedAnnouncement(message: string | undefined, delayMs: number): void {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(message), delayMs);
    return () => clearTimeout(timer);
  }, [message, delayMs]);
}
