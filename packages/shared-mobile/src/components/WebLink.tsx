import { Pressable, Text } from "react-native";
import { LINK_MESSAGES } from "../constants/links";
import { useOpenWebsite } from "../hooks/useOpenWebsite";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { WebLinkProps } from "../types/WebLinkProps";

export default function WebLink({ label, webBaseUrl, webPath }: WebLinkProps) {
  const { colors, fontSize } = useTheme();
  const openWebsite = useOpenWebsite();
  return (
    <Pressable
      accessibilityHint={LINK_MESSAGES.opensBrowser}
      accessibilityRole="link"
      onPress={() => void openWebsite(webBaseUrl, webPath)}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
    >
      <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}
