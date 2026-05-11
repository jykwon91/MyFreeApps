import { Button, LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUndoSignedLeaseExtensionMutation } from "@/shared/store/signedLeasesApi";

export interface UndoExtensionDialogProps {
  leaseId: string;
  versionId: string;
  /** The end date the latest extension carried — shown for context. */
  currentExtendedEndsOn: string;
  onClose: () => void;
}

interface ConflictDetail {
  code:
    | "CANNOT_UNDO_SEED_ROW"
    | "NOT_LATEST_EXTENSION"
    | "UNDO_WINDOW_EXPIRED";
  message: string;
}

function extractConflictDetail(err: unknown): ConflictDetail | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: number; data?: { detail?: unknown } };
  if (e.status !== 409) return null;
  const detail = e.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const code = (detail as { code?: unknown }).code;
  if (
    code === "CANNOT_UNDO_SEED_ROW"
    || code === "NOT_LATEST_EXTENSION"
    || code === "UNDO_WINDOW_EXPIRED"
  ) {
    return detail as ConflictDetail;
  }
  return null;
}

function describeConflict(detail: ConflictDetail): string {
  switch (detail.code) {
    case "CANNOT_UNDO_SEED_ROW":
      return "The original lease term can't be undone — it's not an extension.";
    case "NOT_LATEST_EXTENSION":
      return "A newer extension exists. Undo the latest extension first.";
    case "UNDO_WINDOW_EXPIRED":
      return "This extension is older than 30 days and can no longer be undone.";
  }
}

/**
 * Confirmation dialog for undoing a recent lease extension.
 *
 * Matches the EndTenancyDialog pattern (inline modal, no Radix dependency).
 * The rendered addendum attachment is intentionally preserved as an audit
 * record — the dialog copy makes that explicit so the host isn't surprised.
 */
export default function UndoExtensionDialog({
  leaseId,
  versionId,
  currentExtendedEndsOn,
  onClose,
}: UndoExtensionDialogProps) {
  const [undoExtension, { isLoading }] = useUndoSignedLeaseExtensionMutation();

  async function handleConfirm() {
    try {
      await undoExtension({ leaseId, versionId }).unwrap();
      showSuccess("Extension undone.");
      onClose();
    } catch (err) {
      const conflict = extractConflictDetail(err);
      if (conflict) {
        showError(describeConflict(conflict));
        return;
      }
      showError("Couldn't undo the extension. Please try again.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Undo extension"
      aria-modal="true"
      data-testid="undo-extension-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">Undo extension</h2>
        <p className="text-sm text-muted-foreground">
          Roll the end date back from{" "}
          <span className="font-medium text-foreground">
            {currentExtendedEndsOn}
          </span>
          {" "}to the previous term. The rendered addendum stays attached to
          the lease as an audit record.
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="undo-extension-cancel"
            onClick={onClose}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="undo-extension-confirm"
            isLoading={isLoading}
            loadingText="Undoing..."
            onClick={() => void handleConfirm()}
          >
            Undo extension
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
