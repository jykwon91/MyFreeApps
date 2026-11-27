import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/useTheme";
import type { AuthScreenFrameProps } from "../types/AuthScreenFrameProps";
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import ToastProvider from "./ToastProvider";

/**
 * The scrolling, keyboard-aware page sign-in, sign-up and the password reset sit in. It has its own toasts, as these
 * show before the app's screens and, in a modal, above them.
 */
export default function AuthScreenFrame({ children }: AuthScreenFrameProps) {
  const { colors, spacing } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <ToastProvider bottomOffset={bottom + spacing.lg}>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScroll
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: colors.background }}
        >
          {children}
        </KeyboardAwareScroll>
      </View>
    </ToastProvider>
  );
}
