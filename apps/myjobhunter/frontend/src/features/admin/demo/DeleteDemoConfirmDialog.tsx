import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@platform/ui";

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
 * This wrapper passes demo-specific copy + an AlertTriangle warning icon
 * via the `description` slot of the shared ConfirmDialog.
 */
export default function DeleteDemoConfirmDialog({
  open,
  email,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteDemoConfirmDialogProps) {
  const description = (
    <span className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden />
      <span>
        This will permanently delete{" "}
        <span className="font-mono break-all">{email}</span> and all their
        seeded data. This cannot be undone.
      </span>
    </span>
  );

  return (
    <ConfirmDialog
      open={open}
      title="Delete demo account?"
      description={description}
      confirmLabel="Delete"
      variant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
