import * as Dialog from "@radix-ui/react-dialog";
import { LoadingButton } from "@platform/ui";
import { AlertTriangle } from "lucide-react";

interface DeleteDemoConfirmDialogProps {
  open: boolean;
  email: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for deleting a demo account.
 *
 * Demo accounts are hard-deleted with cascade — there is no undo.
 * This modal makes that explicit. Renamed/extracted instead of using
 * a generic ConfirmDialog because the warning copy is specific
 * enough to deserve its own component.
 */
export default function DeleteDemoConfirmDialog({
  open,
  email,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteDemoConfirmDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-5 h-5 text-destructive shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="flex-1">
              <Dialog.Title className="text-base font-semibold">
                Delete demo account?
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                This will permanently delete{" "}
                <span className="font-mono break-all">{email}</span> and all
                their seeded data. This cannot be undone.
              </Dialog.Description>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted transition-colors min-h-[36px]"
              disabled={isLoading}
            >
              Cancel
            </button>
            <LoadingButton
              onClick={onConfirm}
              isLoading={isLoading}
              loadingText="Deleting..."
              variant="destructive"
            >
              Delete
            </LoadingButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
