import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Button from "./Button";
import Spinner from "../icons/Spinner";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" and "destructive" are equivalent — both render a red confirm button. */
  variant?: "default" | "danger" | "destructive";
  /**
   * Externally-controlled loading state. Use this when the in-flight state is
   * managed outside the dialog (e.g., from an RTK Query mutation's isLoading).
   *
   * Alternatively, return a Promise from `onConfirm` and the dialog will track
   * loading state internally until the Promise settles.
   *
   * If both are provided, the button shows loading whenever either is true.
   */
  isLoading?: boolean;
  /**
   * Called when the user confirms. If the function returns a Promise, the
   * confirm button enters a loading state until the Promise settles. The caller
   * owns error handling (toast, navigation, etc.) — this component only tracks
   * loading state and does not suppress or re-throw rejections.
   */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);

  const isDestructive = variant === "danger" || variant === "destructive";
  const showLoading = isLoading || isPending;

  function handleConfirm() {
    const result = onConfirm();
    if (result instanceof Promise) {
      setIsPending(true);
      // The caller owns error handling (toast, navigation, etc.). We suppress
      // the rejection here so it does not become an unhandled Promise rejection
      // in the onClick handler. The caller should attach its own .catch() for
      // user-visible error feedback.
      result.catch(() => undefined).finally(() => setIsPending(false));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-2">
            {description}
          </Dialog.Description>
          {children}
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={showLoading}>
              {cancelLabel}
            </Button>
            <button
              onClick={handleConfirm}
              disabled={showLoading}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                isDestructive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {showLoading ? (
                <>
                  <Spinner />
                  Processing...
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
