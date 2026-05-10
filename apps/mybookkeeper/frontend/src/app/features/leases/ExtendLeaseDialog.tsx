import { useState } from "react";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useExtendSignedLeaseMutation } from "@/shared/store/signedLeasesApi";

const NOTES_MAX_LENGTH = 2000;

export interface ExtendLeaseDialogProps {
  leaseId: string;
  currentEndsOn: string;
  onClose: () => void;
}

interface ConflictDetail {
  code:
    | "INVALID_STATUS_FOR_EXTENSION"
    | "MISSING_CURRENT_END_DATE"
    | "NEW_END_DATE_NOT_AFTER_CURRENT";
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
    code === "INVALID_STATUS_FOR_EXTENSION"
    || code === "MISSING_CURRENT_END_DATE"
    || code === "NEW_END_DATE_NOT_AFTER_CURRENT"
  ) {
    return detail as ConflictDetail;
  }
  return null;
}

function describeConflict(detail: ConflictDetail): string {
  switch (detail.code) {
    case "INVALID_STATUS_FOR_EXTENSION":
      return "Only signed or active leases can be extended.";
    case "MISSING_CURRENT_END_DATE":
      return "This lease has no current end date — fill in the original term before extending.";
    case "NEW_END_DATE_NOT_AFTER_CURRENT":
      return "The new end date must be after the current end date.";
  }
}

/**
 * Inline dialog to extend a signed or active lease's end date.
 *
 * Posts ``POST /signed-leases/{id}/extend`` with the new end date, optional
 * notes, and an opt-in to email the tenant after commit. The backend renders
 * the addendum PDF, attaches it, and updates ``ends_on`` atomically.
 */
export default function ExtendLeaseDialog({
  leaseId,
  currentEndsOn,
  onClose,
}: ExtendLeaseDialogProps) {
  const [newEndsOn, setNewEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [emailTenant, setEmailTenant] = useState(false);
  const [extendLease, { isLoading }] = useExtendSignedLeaseMutation();

  const isValid =
    newEndsOn !== ""
    && newEndsOn > currentEndsOn
    && notes.length <= NOTES_MAX_LENGTH;

  async function handleConfirm() {
    if (!isValid) return;
    try {
      await extendLease({
        leaseId,
        data: {
          new_ends_on: newEndsOn,
          notes: notes.trim() || undefined,
          email_tenant: emailTenant,
        },
      }).unwrap();
      showSuccess(
        emailTenant
          ? "Lease extended. I'll email the tenant shortly."
          : "Lease extended.",
      );
      onClose();
    } catch (err) {
      const conflict = extractConflictDetail(err);
      if (conflict) {
        showError(describeConflict(conflict));
        return;
      }
      showError("Couldn't extend the lease. Please try again.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Extend lease"
      aria-modal="true"
      data-testid="extend-lease-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Extend lease</h2>
          <p className="text-sm text-muted-foreground">
            Current end date:{" "}
            <span className="font-medium text-foreground">{currentEndsOn}</span>.
            I'll auto-render an extension addendum PDF and attach it to the lease.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="extend-lease-new-end"
            className="block text-sm font-medium"
          >
            New end date
          </label>
          <input
            id="extend-lease-new-end"
            type="date"
            data-testid="extend-lease-new-end"
            value={newEndsOn}
            min={currentEndsOn}
            onChange={(e) => setNewEndsOn(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px]"
          />
          {newEndsOn !== "" && newEndsOn <= currentEndsOn ? (
            <p
              className="text-xs text-red-600"
              data-testid="extend-lease-new-end-error"
            >
              New end date must be after {currentEndsOn}.
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="extend-lease-notes"
            className="block text-sm font-medium"
          >
            Notes{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="extend-lease-notes"
            data-testid="extend-lease-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX_LENGTH}
            rows={3}
            placeholder="e.g. Tenant requested 6-month extension at current rent"
            className="w-full px-3 py-2 text-sm border rounded-md resize-none"
          />
          <p className="text-right text-xs text-muted-foreground">
            {notes.length}/{NOTES_MAX_LENGTH}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="extend-lease-email-tenant"
            checked={emailTenant}
            onChange={(e) => setEmailTenant(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Email the tenant the rendered addendum</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="extend-lease-cancel"
            onClick={onClose}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="extend-lease-confirm"
            isLoading={isLoading}
            loadingText="Extending..."
            disabled={!isValid}
            onClick={() => void handleConfirm()}
          >
            Extend lease
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
