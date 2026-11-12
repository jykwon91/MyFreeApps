import { useMemo, useState } from "react";
import { View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useTheme } from "../theme/useTheme";
import type { ToastAction } from "../types/ToastAction";
import type { ToastProviderProps } from "../types/ToastProviderProps";
import type { ToastVariant } from "../types/ToastVariant";
import Toast from "./Toast";
import { ToastContext } from "./ToastContext";

/** Holds the toast above the screens, so a message outlives the screen that sent it. */
export default function ToastProvider({ children, bottomOffset }: ToastProviderProps) {
  const { spacing } = useTheme();
  // From the bottom of the screen, nav bar included: Android draws edge to edge, so the toast is measured from there.
  const keyboardHeight = useKeyboardState((keyboard) => (keyboard.isVisible ? keyboard.height : 0));
  const [toast, setToast] = useState<{ id: number; message: string; variant: ToastVariant; action?: ToastAction } | null>(null);
  const value = useMemo(
    () => ({
      showToast: (message: string, variant: ToastVariant = "success", action?: ToastAction) =>
        setToast((current) => ({ id: (current?.id ?? 0) + 1, message, variant, action })),
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {toast ? (
          <Toast
            // A new toast is a new element, so saying the same thing twice restarts its timer.
            key={toast.id}
            message={toast.message}
            action={toast.action}
            onDismiss={() => setToast(null)}
            // The keyboard covers the tab bar, so above it is clear.
            style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: keyboardHeight ? keyboardHeight + spacing.md : bottomOffset }}
            variant={toast.variant}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}
