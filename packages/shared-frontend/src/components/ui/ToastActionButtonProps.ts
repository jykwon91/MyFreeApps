import type { ToastAction } from "../../types/toast-action";

export interface ToastActionButtonProps {
  action: ToastAction;
  /** Closes the toast once the action has finished. */
  onDone: () => void;
}
