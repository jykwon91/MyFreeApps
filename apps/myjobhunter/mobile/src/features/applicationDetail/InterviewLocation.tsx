import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { isUrl } from "../../lib/isUrl";
import type { InterviewLocationProps } from "../../types/InterviewLocationProps";

/** A meeting link opens; a street address is just text. */
export default function InterviewLocation({ value }: InterviewLocationProps) {
  const { colors, fontSize } = useTheme();
  const openLink = useOpenLink();
  if (!isUrl(value)) {
    return (
      <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {value}
      </Text>
    );
  }
  return (
    <Pressable accessibilityRole="link" onPress={() => void openLink(value)} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.primary, textDecorationLine: "underline" }}>{value}</Text>
    </Pressable>
  );
}
