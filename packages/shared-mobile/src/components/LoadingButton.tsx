import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { DISABLED_OPACITY, PRESSED_OPACITY } from "../constants/loadingButton";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { LoadingButtonProps } from "../types/LoadingButtonProps";
import { buttonBackground, buttonForeground } from "../utils/buttonColors";
import { isPromise } from "../utils/isPromise";

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
  const foreground = buttonForeground(variant, colors);

  const handlePress = (): void => {
    if (inFlight.current || isDisabled) return;
    inFlight.current = true;
    let result: void | Promise<void>;
    try {
      result = onPress();
    } catch (error) {
      inFlight.current = false;
      throw error;
    }
    const isAsync = isPromise(result);
    if (isAsync) setIsPending(true);
    // Sync work settles on the next microtask, which still stops a second press in this tick.
    void Promise.resolve(result).finally(() => {
      inFlight.current = false;
      if (isAsync) setIsPending(false);
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
          backgroundColor: buttonBackground(variant, colors),
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.border,
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
