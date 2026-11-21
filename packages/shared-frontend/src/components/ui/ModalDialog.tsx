import * as Dialog from "@radix-ui/react-dialog";
import { useRestoreFocusOnClose } from "../../hooks/useRestoreFocusOnClose";
import type { ModalDialogProps } from "./ModalDialogProps";

const DEFAULT_OVERLAY_CLASS = "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";

/**
 * Modal for dialogs that are mounted while open and unmounted to close.
 * Moves focus inside, keeps Tab there, closes on Escape, hides the page
 * behind from screen readers, and on close returns focus to whatever opened
 * it. A click on the backdrop does nothing unless `closeOnBackdropClick`.
 */
export default function ModalDialog({
  testId,
  onClose,
  panelClassName,
  overlayClassName = DEFAULT_OVERLAY_CLASS,
  overlayTestId,
  closeOnBackdropClick = false,
  preventClose = false,
  hasDescription = false,
  children,
}: ModalDialogProps) {
  const restoreFocus = useRestoreFocusOnClose(true);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && !preventClose) onClose();
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (closeOnBackdropClick && !preventClose && event.target === event.currentTarget) onClose();
  }

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-testid={overlayTestId} className={overlayClassName} onClick={handleOverlayClick}>
          <Dialog.Content
            data-testid={testId}
            onCloseAutoFocus={restoreFocus}
            onInteractOutside={(event) => event.preventDefault()}
            {...(hasDescription ? {} : { "aria-describedby": undefined })}
            className={`${panelClassName} focus:outline-none`}
          >
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
