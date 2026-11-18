import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { DISABLED_OPACITY, PRESSED_OPACITY } from "../constants/loadingButton";
import { usePendingPress } from "../hooks/usePendingPress";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { LoadingButtonProps } from "../types/LoadingButtonProps";
import { buttonBackground, buttonForeground } from "../utils/buttonColors";
import { loadingAccessibilityLabel } from "../utils/loadingAccessibilityLabel";

export default function LoadingButton({
  children,
  onPress,
  isLoading = false,
  loadingText,
  variant = "primary",
  disabled = false,
  style,
  accessibilityState,
  accessibilityLabel,
  ...props
}: LoadingButtonProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { isPending, press } = usePendingPress(onPress, disabled || isLoading);

  const isBusy = isLoading || isPending;
  const isDisabled = disabled || isBusy;
  const foreground = buttonForeground(variant, colors);

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={loadingAccessibilityLabel(accessibilityLabel, loadingText, isBusy)}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: isBusy }}
      disabled={isDisabled}
      onPress={press}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          minWidth: MIN_TOUCH_TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: buttonBackground(variant, colors),
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.inputBorder,
          // Busy stays at full opacity so the "Saving..." label remains readable.
          opacity: isBusy ? 1 : isDisabled ? DISABLED_OPACITY : pressed ? PRESSED_OPACITY : 1,
        },
        style,
      ]}
    >
      {isBusy ? (
        <View style={{ marginRight: spacing.sm }}>
          <ActivityIndicator color={foreground} size="small" testID="loading-button-spinner" />
        </View>
      ) : null}
      <Text style={{ color: foreground, fontSize: fontSize.sm, fontWeight: "500" }}>
        {isBusy ? (loadingText ?? children) : children}
      </Text>
    </Pressable>
  );
}
