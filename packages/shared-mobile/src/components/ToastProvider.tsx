import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { ToastProviderProps } from "../types/ToastProviderProps";
import type { ToastVariant } from "../types/ToastVariant";
import Toast from "./Toast";
import { ToastContext } from "./ToastContext";

/** Holds the toast above the screens, so a message outlives the screen that sent it. */
export default function ToastProvider({ children, bottomOffset }: ToastProviderProps) {
  const { spacing } = useTheme();
  const [toast, setToast] = useState<{ id: number; message: string; variant: ToastVariant } | null>(null);
  const value = useMemo(
    () => ({
      showToast: (message: string, variant: ToastVariant = "success") => setToast((current) => ({ id: (current?.id ?? 0) + 1, message, variant })),
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
            onDismiss={() => setToast(null)}
            style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: bottomOffset }}
            variant={toast.variant}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}
