import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../constants/addApplication";
import type { ReadingHintProps } from "../../types/ReadingHintProps";

/** Says a slow read is still going, so a long wait doesn't look stuck. */
export default function ReadingHint({ isLongRunning }: ReadingHintProps) {
  const { colors, fontSize } = useTheme();
  if (!isLongRunning) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
      {MESSAGES.longRunning}
    </Text>
  );
}
