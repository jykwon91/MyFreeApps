import type { ToastAction } from "./ToastAction";
import type { ToastVariant } from "./ToastVariant";

export interface ToastContextValue {
  /** Shows `message`, replacing any toast already showing. An `action` adds a button such as "Undo". */
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
  /**
   * Shows `message` for sighted users only: a screen reader is not told, and skips it. For a message the
   * screen reader already has from somewhere else, such as a failed save whose problems are read as a
   * field summary, where this would only say the first of them again.
   */
  showVisualToast: (message: string, variant?: ToastVariant) => void;
}
