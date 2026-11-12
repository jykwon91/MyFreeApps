import { showError, showSuccess } from "../lib/toast-store";
import type { ToastAction } from "../types/toast-action";

interface UseToastReturn {
  showError: (message: string, action?: ToastAction) => void;
  showSuccess: (message: string, action?: ToastAction) => void;
}

export function useToast(): UseToastReturn {
  return { showError, showSuccess };
}
