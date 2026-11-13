import { MIN_TOUCH_TARGET, useTheme, useToneColor } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { PROFILE_BANNER_MESSAGES as MESSAGES } from "../../constants/profileBanner";
import type { ProfileCompletenessBannerProps } from "../../types/ProfileCompletenessBannerProps";

/** The reminder that postings can't be scored without a resume or skills, with its link and dismiss. */
export default function ProfileCompletenessBanner({ onSetUp, onDismiss }: ProfileCompletenessBannerProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const tone = useToneColor("warning");
  const foreground = tone?.foreground ?? colors.foreground;
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: tone?.background ?? colors.muted }}
      testID="profile-completeness-banner"
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: foreground }}>
          {MESSAGES.heading}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: foreground }}>{MESSAGES.body}</Text>
        <Pressable
          accessibilityHint={MESSAGES.setUpHint}
          accessibilityRole="link"
          onPress={onSetUp}
          style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: foreground, textDecorationLine: "underline" }}>{MESSAGES.setUp}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel={MESSAGES.dismiss}
        accessibilityRole="button"
        onPress={onDismiss}
        style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontSize: fontSize.lg, color: foreground }}>
          ×
        </Text>
      </Pressable>
    </View>
  );
}
