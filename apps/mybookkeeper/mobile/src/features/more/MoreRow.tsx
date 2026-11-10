import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Linking, Pressable, Text } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import type { MoreRowProps } from "../../types/MoreRowProps";

export default function MoreRow({ item, secondary, onPress }: MoreRowProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { screen } = item;
  return (
    <Pressable
      accessibilityHint={screen ? undefined : "Opens your browser"}
      accessibilityLabel={secondary ? `${item.label}, ${secondary}` : undefined}
      accessibilityRole={screen ? "button" : "link"}
      onPress={() => {
        if (onPress) onPress();
        else if (screen) router.push(screen);
        else void Linking.openURL(`${WEB_BASE_URL}${item.webPath}`);
      }}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingVertical: spacing.xs }}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{item.label}</Text>
      {secondary ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{secondary}</Text> : null}
    </Pressable>
  );
}
