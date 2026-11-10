import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { LINK_MESSAGES } from "../constants/links";
import { useOpenWebsite } from "../hooks/useOpenWebsite";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { MoreRowProps } from "../types/MoreRowProps";

/** One place on the More menu: the app's own screen when it has one, otherwise the website. */
export default function MoreRow({ item, webBaseUrl, secondary, onPress }: MoreRowProps) {
  const { colors, fontSize, spacing } = useTheme();
  const openWebsite = useOpenWebsite();
  return (
    <Pressable
      accessibilityHint={item.screen ? undefined : LINK_MESSAGES.opensBrowser}
      accessibilityLabel={secondary ? `${item.label}, ${secondary}` : undefined}
      accessibilityRole={item.screen ? "button" : "link"}
      onPress={() => {
        if (onPress) onPress();
        else if (item.screen) router.push(item.screen);
        else if (item.webPath) void openWebsite(webBaseUrl, item.webPath);
      }}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingVertical: spacing.xs }}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{item.label}</Text>
      {secondary ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{secondary}</Text> : null}
    </Pressable>
  );
}
