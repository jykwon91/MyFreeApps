import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import { TYPING_DOT_COUNT } from "../../constants/conversation";

/** "The tutor is thinking": between sending a turn and the first words of the reply. */
export default function TypingDots() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ alignItems: "flex-start" }}>
      <View
        accessibilityLabel={PRACTICE_COPY.tutorThinking}
        accessibilityRole="progressbar"
        accessible
        style={{
          flexDirection: "row",
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.md * 2,
          borderBottomLeftRadius: radius.sm,
          backgroundColor: colors.muted,
        }}
        testID="typing-dots"
      >
        {Array.from({ length: TYPING_DOT_COUNT }, (_, index) => (
          <View key={index} style={{ width: spacing.sm, height: spacing.sm, borderRadius: radius.full, backgroundColor: colors.mutedForeground }} />
        ))}
      </View>
    </View>
  );
}
