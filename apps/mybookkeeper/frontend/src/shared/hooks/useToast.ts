import { showError, showSuccess } from "@platform/ui";

interface UseToastReturn {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

export function useToast(): UseToastReturn {
  return { showError, showSuccess };
}
