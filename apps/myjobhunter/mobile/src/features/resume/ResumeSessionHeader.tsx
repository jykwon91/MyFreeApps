import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeSessionHeaderProps } from "../../types/ResumeSessionHeaderProps";

/** The session's title row, with the way out to a different session. */
export default function ResumeSessionHeader({ label, onStartNew }: ResumeSessionHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ flexShrink: 1, color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.heading}
      </Text>
      <Pressable accessibilityRole="button" hitSlop={spacing.sm} onPress={onStartNew} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
        <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: "500" }}>{label}</Text>
      </Pressable>
    </View>
  );
}
