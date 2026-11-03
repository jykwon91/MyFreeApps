import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { ButtonVariant } from "../types/ButtonVariant";
import type { LoadingButtonProps } from "../types/LoadingButtonProps";
import type { ThemeColors } from "../types/ThemeColors";
import { isPromise } from "../utils/isPromise";

const DISABLED_OPACITY = 0.5;
const PRESSED_OPACITY = 0.8;

function backgroundFor(variant: ButtonVariant, colors: ThemeColors): string {
  switch (variant) {
    case "primary":
      return colors.primary;
    case "destructive":
      return colors.destructive;
    case "secondary":
    case "ghost":
      return "transparent";
  }
}

function foregroundFor(variant: ButtonVariant, colors: ThemeColors): string {
  switch (variant) {
    case "primary":
      return colors.primaryForeground;
    case "destructive":
      return colors.destructiveForeground;
    case "secondary":
      return colors.foreground;
    case "ghost":
      return colors.mutedForeground;
  }
}

export default function LoadingButton({
  children,
  onPress,
  isLoading = false,
  loadingText,
  variant = "primary",
  disabled = false,
  style,
  accessibilityState,
  ...props
}: LoadingButtonProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [isPending, setIsPending] = useState(false);
  // State only blocks a second press after a re-render. The ref blocks it immediately.
  const inFlight = useRef(false);

  const isBusy = isLoading || isPending;
  const isDisabled = disabled || isBusy;
  const foreground = foregroundFor(variant, colors);

  const handlePress = (): void => {
    if (inFlight.current || isDisabled) return;
    const result = onPress();
    if (!isPromise(result)) return;
    inFlight.current = true;
    setIsPending(true);
    void Promise.resolve(result).finally(() => {
      inFlight.current = false;
      setIsPending(false);
    });
  };

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: isBusy }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          minWidth: MIN_TOUCH_TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: backgroundFor(variant, colors),
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.border,
          opacity: isDisabled ? DISABLED_OPACITY : pressed ? PRESSED_OPACITY : 1,
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
