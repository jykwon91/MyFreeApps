import { AccessibilityInfo } from "react-native";
import { useAccessibilitySetting } from "./useAccessibilitySetting";

const read = () => AccessibilityInfo.isReduceMotionEnabled();

/** The system's reduce-motion setting, or null until it has been read. */
export function useReduceMotion(): boolean | null {
  return useAccessibilitySetting("reduceMotionChanged", read);
}
