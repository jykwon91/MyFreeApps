import { showError, showSuccess } from "../lib/toast-store";

interface UseToastReturn {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

export function useToast(): UseToastReturn {
  return { showError, showSuccess };
}
