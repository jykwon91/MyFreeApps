import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Linking, Pressable, Text } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import type { MoreMenuItem } from "../../types/MoreMenuItem";

export default function MoreRow({ item }: { item: MoreMenuItem }) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <Pressable
      accessibilityHint="Opens your browser"
      accessibilityRole="link"
      onPress={() => void Linking.openURL(`${WEB_BASE_URL}${item.webPath}`)}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingVertical: spacing.xs }}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{item.label}</Text>
    </Pressable>
  );
}
