import type { ToastAction } from "./toast-action";
import type { ToastVariant } from "./toast-variant";

export interface ToastEvent {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}
