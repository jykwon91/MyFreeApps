import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { CONVERSATION_MESSAGES } from "../../constants/conversation";

/** The conversation's shape: the scenario and its goals, an empty transcript, and the composer. */
export default function ConversationSkeleton() {
  const { colors, spacing, fontSize, radius } = useTheme();
  return (
    <View
      accessibilityLabel={CONVERSATION_MESSAGES.loading}
      accessibilityState={{ busy: true }}
      accessible
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ flex: 1, gap: spacing.sm, padding: spacing.lg }} testID="conversation-skeleton-header">
        <Skeleton height={fontSize.xl} width="60%" />
        <Skeleton height={fontSize.sm} width="85%" />
        <Skeleton height={fontSize.xs} width="70%" />
      </View>
      <View style={{ gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.border }}>
        <Skeleton height={fontSize.xs} width="30%" />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} width="100%" />
      </View>
    </View>
  );
}
