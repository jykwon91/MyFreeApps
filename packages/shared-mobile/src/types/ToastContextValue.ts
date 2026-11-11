import type { ToastAction } from "./ToastAction";
import type { ToastVariant } from "./ToastVariant";

export interface ToastContextValue {
  /** Shows `message`, replacing any toast already showing. An `action` adds a button such as "Undo". */
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
}
