import { Pressable, Text, View } from "react-native";
import { useAnnouncement } from "../hooks/useAnnouncement";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { BannerProps } from "../types/BannerProps";

/**
 * For a message the user mustn't miss. It stays until the situation changes, unlike a Toast.
 * Info is for a state to know about rather than act on: it is read politely, not as an alert.
 */
export default function Banner({ message, tone = "error", actions = [], style }: BannerProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const palette = {
    error: { background: colors.toastErrorBackground, border: colors.toastErrorBorder, foreground: colors.toastErrorForeground },
    success: { background: colors.toastSuccessBackground, border: colors.toastSuccessBorder, foreground: colors.toastSuccessForeground },
    info: { background: colors.toastInfoBackground, border: colors.toastInfoBorder, foreground: colors.toastInfoForeground },
  }[tone];
  const foreground = palette.foreground;
  const isInfo = tone === "info";
  useAnnouncement(message, isInfo ? "polite" : "assertive");

  return (
    <View
      style={[
        {
          padding: spacing.md,
          gap: spacing.xs,
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <Text
        accessibilityRole={isInfo ? "text" : "alert"}
        style={{ color: foreground, fontSize: fontSize.sm }}
      >
        {message}
      </Text>
      {actions.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {actions.map(({ label, accessibilityHint, onPress }) => (
            <Pressable
              accessibilityHint={accessibilityHint}
              accessibilityRole="button"
              key={label}
              onPress={onPress}
              style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center" }}
            >
              <Text
                style={{
                  color: foreground,
                  fontSize: fontSize.sm,
                  fontWeight: "600",
                  textDecorationLine: "underline",
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
