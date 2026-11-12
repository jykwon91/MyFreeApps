import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { TutorBubbleActionProps } from "../../types/TutorBubbleActionProps";

/** A small text button under a tutor reply: play it again, slowly, or show its translation. */
export default function TutorBubbleAction({ label, hint, expanded, onPress }: TutorBubbleActionProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.xs }}
    >
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}
