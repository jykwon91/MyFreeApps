import type { StyleProp, ViewStyle } from "react-native";
import type { ToastAction } from "./ToastAction";
import type { ToastVariant } from "./ToastVariant";

export interface ToastProps {
  /** Screen readers announce it when it appears or changes, on iOS and Android, unless `isVisualOnly`. */
  message: string;
  variant: ToastVariant;
  /** Called when the user dismisses the toast or `durationMs` elapses. */
  onDismiss: () => void;
  /** A button before the dismiss button; pressing it also dismisses the toast. */
  action?: ToastAction;
  /** Not announced, and hidden from a screen reader, because it only repeats something it has been told. */
  isVisualOnly?: boolean;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}
