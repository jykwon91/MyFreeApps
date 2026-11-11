import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { DOCUMENT_MESSAGES as MESSAGES } from "../../constants/documents";
import type { DocumentApplicationLinkProps } from "../../types/DocumentApplicationLinkProps";

/** The website's "Application" link on a document: opens the application it's for. */
export default function DocumentApplicationLink({ title, onPress }: DocumentApplicationLinkProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint={MESSAGES.opensApplication}
      accessibilityLabel={MESSAGES.openApplicationFor(title)}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.primary }}>{MESSAGES.application}</Text>
    </Pressable>
  );
}
