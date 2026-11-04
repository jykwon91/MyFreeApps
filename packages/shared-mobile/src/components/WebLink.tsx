import { Linking, Pressable, Text } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";

export default function WebLink({ label, url }: { label: string; url: string }) {
  const { colors, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint="Opens your browser"
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
    >
      <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}
