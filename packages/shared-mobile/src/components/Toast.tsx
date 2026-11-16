import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { TOAST_DEFAULT_DURATION_MS, TOAST_SCREEN_READER_DURATION_MS } from "../constants/toast";
import { useAnnouncement } from "../hooks/useAnnouncement";
import { useScreenReaderEnabled } from "../hooks/useScreenReaderEnabled";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { ToastProps } from "../types/ToastProps";

export default function Toast({
  message,
  variant,
  onDismiss,
  action,
  durationMs = TOAST_DEFAULT_DURATION_MS,
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

  // Swiping to a toast's button takes a screen-reader user longer than the default
  // duration (WCAG 2.2.1). A toast with an action stays until dismissed; a plain one lasts longer.
  const screenReaderOn = useScreenReaderEnabled() === true;
  const staysUntilDismissed = screenReaderOn && action !== undefined;
  const effectiveDurationMs = screenReaderOn ? Math.max(durationMs, TOAST_SCREEN_READER_DURATION_MS) : durationMs;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDismissed = useRef(false);

  const dismiss = useCallback((): void => {
    if (isDismissed.current) return;
    isDismissed.current = true;
    clearTimeout(timer.current);
    latestOnDismiss.current();
  }, []);

  useEffect(() => {
    isDismissed.current = false;
    if (staysUntilDismissed) return undefined;
    timer.current = setTimeout(dismiss, effectiveDurationMs);
    return () => clearTimeout(timer.current);
  }, [dismiss, effectiveDurationMs, staysUntilDismissed, message]);

  useAnnouncement(message);

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
        accessibilityRole="alert"
        style={{ flex: 1, color: foreground, fontSize: fontSize.sm, paddingVertical: spacing.md }}
      >
        {message}
      </Text>
      {action ? (
        <Pressable
          accessibilityHint={action.accessibilityHint}
          accessibilityRole="button"
          onPress={() => {
            dismiss();
            action.onPress();
          }}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, paddingHorizontal: spacing.sm, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: foreground, fontSize: fontSize.sm, fontWeight: "600", textDecorationLine: "underline" }}>{action.label}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="Dismiss notification"
        accessibilityRole="button"
        onPress={dismiss}
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
