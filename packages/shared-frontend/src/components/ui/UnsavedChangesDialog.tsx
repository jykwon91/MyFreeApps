import * as Dialog from "@radix-ui/react-dialog";
import Button from "./Button";
import LoadingButton from "./LoadingButton";
import { useRestoreFocusOnClose } from "../../hooks/useRestoreFocusOnClose";
import type { UnsavedChangesDialogProps } from "./UnsavedChangesDialogProps";

/**
 * Asks what to do with unsaved edits. It opens on Keep editing, so a reflex Enter throws
 * nothing away. Escape means Keep editing and an outside click does nothing, so edits are
 * only ever thrown away by Discard. When it closes, focus goes back to where it was.
 */
export default function UnsavedChangesDialog({
  open,
  copy,
  onKeepEditing,
  onDiscard,
  save,
  error,
}: UnsavedChangesDialogProps) {
  const isSaving = save?.isSaving ?? false;
  // It has no trigger for Radix to return focus to, so focus goes back to whatever had it.
  const restoreFocus = useRestoreFocusOnClose(open);

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
          // With no body there's nothing to describe it, which Radix needs saying outright.
          {...(copy.discardBody ? {} : { "aria-describedby": undefined })}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[calc(100%-2rem)] max-w-md rounded-lg border bg-card p-6 shadow-lg focus:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement)
              .querySelector<HTMLButtonElement>("[data-keep-editing]")
              ?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (isSaving) e.preventDefault();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={restoreFocus}
        >
          <Dialog.Title className="text-base font-semibold">{copy.discardTitle}</Dialog.Title>
          {copy.discardBody ? (
            <Dialog.Description className="text-sm text-muted-foreground mt-2">
              {copy.discardBody}
            </Dialog.Description>
          ) : null}
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
              className={save ? "min-h-[44px] px-3 sm:mr-auto" : "min-h-[44px] px-3 sm:ml-auto"}
            >
              {copy.discard}
            </Button>
            <Button
              data-keep-editing=""
              variant="secondary"
              size="md"
              onClick={onKeepEditing}
              disabled={isSaving}
              className="min-h-[44px]"
            >
              {copy.keepEditing}
            </Button>
            {save ? (
              <LoadingButton
                variant="primary"
                size="md"
                isLoading={save.isSaving}
                loadingText={save.loadingLabel}
                onClick={save.onSave}
                className="min-h-[44px]"
              >
                {save.label}
              </LoadingButton>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
