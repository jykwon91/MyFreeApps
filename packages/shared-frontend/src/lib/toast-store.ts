type ToastVariant = "error" | "success";

interface ToastEvent {
  id: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (toast: ToastEvent) => void;

const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dispatch(message: string, variant: ToastVariant): void {
  const event: ToastEvent = {
    id: crypto.randomUUID(),
    message,
    variant,
  };
  listeners.forEach((listener) => listener(event));
}

function showError(message: string): void {
  dispatch(message, "error");
}

function showSuccess(message: string): void {
  dispatch(message, "success");
}

export { subscribe, showError, showSuccess };
export type { ToastEvent, ToastVariant };
