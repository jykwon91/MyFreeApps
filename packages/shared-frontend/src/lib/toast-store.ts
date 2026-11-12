import type { ToastAction } from "../types/toast-action";
import type { ToastEvent } from "../types/toast-event";
import type { ToastVariant } from "../types/toast-variant";

type Listener = (toast: ToastEvent) => void;

const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dispatch(message: string, variant: ToastVariant, action?: ToastAction): void {
  const event: ToastEvent = {
    id: crypto.randomUUID(),
    message,
    variant,
    action,
  };
  listeners.forEach((listener) => listener(event));
}

function showError(message: string, action?: ToastAction): void {
  dispatch(message, "error", action);
}

/** An `action` adds a button such as "Undo". */
function showSuccess(message: string, action?: ToastAction): void {
  dispatch(message, "success", action);
}

export { subscribe, showError, showSuccess };
