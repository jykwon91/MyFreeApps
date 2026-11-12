import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { CONVERSATION_MESSAGES } from "../../constants/conversation";
import type { LearnerBubbleProps } from "../../types/LearnerBubbleProps";

/** What the learner wrote. */
export default function LearnerBubble({ text }: LearnerBubbleProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text
        accessibilityLabel={`${CONVERSATION_MESSAGES.learnerSaid}: ${text}`}
        style={{
          maxWidth: "85%",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radius.md * 2,
          borderBottomRightRadius: radius.sm,
          overflow: "hidden",
          backgroundColor: colors.primary,
          color: colors.primaryForeground,
          fontSize: fontSize.sm,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
