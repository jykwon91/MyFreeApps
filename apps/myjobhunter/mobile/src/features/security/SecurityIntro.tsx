import { MIN_TOUCH_TARGET, useTheme, useToneColor } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { SECURITY_MESSAGES as MESSAGES } from "../../constants/security";
import type { SecurityIntroProps } from "../../types/SecurityIntroProps";

/** The website's note recommending two-step sign-in, which stays dismissed once dismissed. */
export default function SecurityIntro({ onDismiss }: SecurityIntroProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const tone = useToneColor("info");
  const foreground = tone?.foreground ?? colors.foreground;
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: tone?.background ?? colors.muted }}
      testID="security-intro"
    >
      <Text style={{ flex: 1, fontSize: fontSize.sm, color: foreground }}>{MESSAGES.intro}</Text>
      <Pressable
        accessibilityLabel={MESSAGES.dismissIntro}
        accessibilityRole="button"
        onPress={onDismiss}
        style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontSize: fontSize.lg, color: foreground }}>×</Text>
      </Pressable>
    </View>
  );
}
