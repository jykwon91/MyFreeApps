import * as Dialog from "@radix-ui/react-dialog";
import { useRestoreFocusOnClose } from "@platform/ui/hooks/useRestoreFocusOnClose";

export interface ModalDialogProps {
  testId: string;
  onClose: () => void;
  /** Classes for the dialog panel itself: width, padding, background, layout. */
  panelClassName: string;
  /**
   * While true, Escape leaves the dialog open, for a dialog whose own Cancel
   * is disabled while its work is in flight.
   */
  preventClose?: boolean;
  /** Set when the children render a `Dialog.Description`, so it is announced with the title. */
  hasDescription?: boolean;
  /** Must include a `Dialog.Title` so the dialog has an accessible name. */
  children: React.ReactNode;
}

/**
 * Centered modal for dialogs that are mounted while open and unmounted to
 * close. Moves focus inside, keeps Tab there, closes on Escape, and on close
 * returns focus to whatever opened it. A click outside does nothing, so a
 * stray click can't throw away a half-filled form.
 */
export default function ModalDialog({
  testId,
  onClose,
  panelClassName,
  preventClose = false,
  hasDescription = false,
  children,
}: ModalDialogProps) {
  const restoreFocus = useRestoreFocusOnClose(true);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && !preventClose) onClose();
  }

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
