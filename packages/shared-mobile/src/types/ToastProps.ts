import type { StyleProp, ViewStyle } from "react-native";
import type { ToastVariant } from "./ToastVariant";

export interface ToastProps {
  message: string;
  variant: ToastVariant;
  /** Called when the user dismisses the toast or `durationMs` elapses. */
  onDismiss: () => void;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}
