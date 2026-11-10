import { MIN_TOUCH_TARGET, useOpenLink, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { ContactLinkProps } from "../../types/ContactLinkProps";

/** An email address or profile that opens in the app that handles it, or plain text when it isn't safe to open. */
export default function ContactLink({ label, url, hint, plainLabel = label }: ContactLinkProps) {
  const { colors, fontSize } = useTheme();
  const openLink = useOpenLink();
  if (!url) {
    return (
      <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
        {plainLabel}
      </Text>
    );
  }
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityRole="link"
      onPress={() => void openLink(url)}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: fontSize.md, color: colors.primary, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}
