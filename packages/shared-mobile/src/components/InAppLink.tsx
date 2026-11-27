import { Pressable, Text } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { InAppLinkProps } from "../types/InAppLinkProps";

/** A text link to another screen of the app, drawn like WebLink but without its "Opens your browser". */
export default function InAppLink({ label, onPress }: InAppLinkProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}>
      <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}
