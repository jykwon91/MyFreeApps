import type { StyleProp, ViewStyle } from "react-native";
import type { ToastVariant } from "./ToastVariant";

export interface ToastProps {
  /** Screen readers announce it when it appears or changes, on iOS and Android. */
  message: string;
  variant: ToastVariant;
  /** Called when the user dismisses the toast or `durationMs` elapses. */
  onDismiss: () => void;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}
