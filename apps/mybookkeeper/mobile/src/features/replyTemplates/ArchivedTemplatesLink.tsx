import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

export default function ArchivedTemplatesLink() {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint={REPLY_TEMPLATE_MESSAGES.archivedLinkHint}
      accessibilityRole="button"
      onPress={() => router.push("/reply-templates/archived")}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
      testID="archived-templates-link"
    >
      <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{REPLY_TEMPLATE_MESSAGES.archivedLink}</Text>
    </Pressable>
  );
}
