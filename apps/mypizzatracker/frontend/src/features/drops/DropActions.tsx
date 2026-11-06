import { useState } from "react";
import { Button, LoadingButton, ConfirmDialog, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Trash2, Play, X } from "lucide-react";
import {
  useUpdateDropMutation,
  useDeleteDropMutation,
} from "@/store/dropsApi";
import { type DropStatus, DROP_STATUS_LABELS } from "@/types/drop/drop";
import type { DropActionsProps } from "@/types/drop/DropActionsProps";

export default function DropActions({ drop }: DropActionsProps) {
  const [updateDrop, { isLoading: isUpdating }] = useUpdateDropMutation();
  const [deleteDrop, { isLoading: isDeleting }] = useDeleteDropMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const setStatus = async (status: DropStatus) => {
    try {
      await updateDrop({ id: drop.id, body: { status } }).unwrap();
      showSuccess(`Drop ${DROP_STATUS_LABELS[status].toLowerCase()}`);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update drop");
    }
  };

  const onDelete = async () => {
    try {
      await deleteDrop(drop.id).unwrap();
      showSuccess("Drop deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete drop");
    }
  };

  if (drop.status === "closed") {
    return <span className="text-xs text-muted-foreground">Read-only</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {drop.status === "planning" ? (
        <>
          <LoadingButton
            size="sm"
            isLoading={isUpdating}
            loadingText="Activating..."
            onClick={() => setStatus("active")}
            disabled={drop.slots.length === 0}
            title={
              drop.slots.length === 0
                ? "Add at least one slot first"
                : "Open this drop for orders"
            }
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Activate
          </LoadingButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmCancel(true)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </>
      ) : null}
      {drop.status === "active" ? (
        <Button
          size="sm"
          onClick={() => setConfirmClose(true)}
        >
          Close drop
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title="Delete this drop?"
        description="The drop and all its slots will be removed. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
      <ConfirmDialog
        open={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => setStatus("closed")}
        title="Cancel this drop?"
        description="The drop will be marked closed and can no longer be edited."
        confirmLabel="Yes, cancel"
        isLoading={isUpdating}
      />
      <ConfirmDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => setStatus("closed")}
        title="Close this drop?"
        description="Service is done. The drop will be finalized and locked for further edits."
        confirmLabel="Close drop"
        isLoading={isUpdating}
      />
    </div>
  );
}
