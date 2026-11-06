import * as Dialog from "@radix-ui/react-dialog";
import { Button, LoadingButton } from "@platform/ui";
import { TRANSACTION_EDIT_MESSAGES as MSG } from "@/shared/lib/transaction-edit-messages";

export interface UnsavedChangesDialogProps {
  open: boolean;
  isSaving: boolean;
  /** Shown inside the dialog after a failed save. */
  error: string | null;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

/**
 * Asks what to do with unsaved edits. Escape means "Keep editing" and an
 * outside click does nothing, so edits are only ever thrown away by Discard.
 */
export default function UnsavedChangesDialog({
  open,
  isSaving,
  error,
  onKeepEditing,
  onDiscard,
  onSave,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSaving) onKeepEditing();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          role="alertdialog"
          data-testid="unsaved-changes-dialog"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[calc(100%-2rem)] max-w-md rounded-lg border bg-card p-6 shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => {
            // Start on the safe choice, so a reflex Enter neither discards nor saves.
            e.preventDefault();
            (e.currentTarget as HTMLElement)
              .querySelector<HTMLButtonElement>("[data-keep-editing]")
              ?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (isSaving) e.preventDefault();
          }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-base font-semibold">{MSG.unsavedTitle}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-2">
            {MSG.unsavedBody}
          </Dialog.Description>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              variant="destructive"
              size="md"
              onClick={onDiscard}
              disabled={isSaving}
              className="min-h-[44px] px-3 sm:mr-auto"
            >
              {MSG.discard}
            </Button>
            <Button
              data-keep-editing=""
              variant="secondary"
              size="md"
              onClick={onKeepEditing}
              disabled={isSaving}
              className="min-h-[44px]"
            >
              {MSG.keepEditing}
            </Button>
            <LoadingButton
              variant="primary"
              size="md"
              isLoading={isSaving}
              loadingText={MSG.saving}
              onClick={onSave}
              className="min-h-[44px]"
            >
              {MSG.saveAndClose}
            </LoadingButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
