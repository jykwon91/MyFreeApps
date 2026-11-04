import type { ToastVariant } from "./ToastVariant";

export interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}
