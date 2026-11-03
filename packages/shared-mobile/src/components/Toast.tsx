import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { ToastProps } from "../types/ToastProps";

// Same as the web Toaster.
const DEFAULT_DURATION_MS = 6000;

export default function Toast({
  message,
  variant,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  style,
}: ToastProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isError = variant === "error";
  const foreground = isError ? colors.toastErrorForeground : colors.toastSuccessForeground;

  // Callers usually pass an inline function. Keep the latest one in a ref so that
  // re-rendering the parent doesn't restart the countdown.
  const latestOnDismiss = useRef(onDismiss);
  useEffect(() => {
    latestOnDismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => latestOnDismiss.current(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, message]);

  return (
    <View
      testID="toast"
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: isError ? colors.toastErrorBackground : colors.toastSuccessBackground,
          borderColor: isError ? colors.toastErrorBorder : colors.toastSuccessBorder,
        },
        style,
      ]}
    >
      <Text
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{ flex: 1, color: foreground, fontSize: fontSize.sm, paddingVertical: spacing.md }}
      >
        {message}
      </Text>
      <Pressable
        accessibilityLabel="Dismiss notification"
        accessibilityRole="button"
        onPress={onDismiss}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          minWidth: MIN_TOUCH_TARGET,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: foreground, fontSize: fontSize.md }}>×</Text>
      </Pressable>
    </View>
  );
}
