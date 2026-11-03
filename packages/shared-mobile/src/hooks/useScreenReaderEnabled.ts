import { AccessibilityInfo } from "react-native";
import { useAccessibilitySetting } from "./useAccessibilitySetting";

const read = () => AccessibilityInfo.isScreenReaderEnabled();

/** Whether VoiceOver or TalkBack is on, or null until it has been read. */
export function useScreenReaderEnabled(): boolean | null {
  return useAccessibilitySetting("screenReaderChanged", read);
}
