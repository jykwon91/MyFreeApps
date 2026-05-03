import { useRef, useState } from "react";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useEndTenancyMutation } from "@/shared/store/applicantsApi";

const REASON_MAX_LENGTH = 500;

interface Props {
  applicantId: string;
  tenantName: string;
  onClose: () => void;
}

/**
 * Inline dialog to confirm ending a tenant's tenancy.
 * Posts PATCH /applicants/{id}/tenancy/end with an optional reason.
 */
export default function EndTenancyDialog({ applicantId, tenantName, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [endTenancy, { isLoading }] = useEndTenancyMutation();
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  async function handleConfirm() {
    try {
      await endTenancy({
        applicantId,
        data: { reason: reason.trim() || null },
      }).unwrap();
      showSuccess(`Tenancy ended for ${tenantName}.`);
      onClose();
    } catch {
      showError("Couldn't end the tenancy. Please try again.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="End tenancy"
      aria-modal="true"
      data-testid="end-tenancy-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">End tenancy</h2>
        <p className="text-sm text-muted-foreground">
          You're ending the tenancy for{" "}
          <span className="font-medium text-foreground">{tenantName}</span>.
          They'll appear in the "Ended" filter until you restart their tenancy.
        </p>

        <div className="space-y-1">
          <label
            htmlFor="end-tenancy-reason"
            className="block text-sm font-medium"
          >
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="end-tenancy-reason"
            ref={reasonRef}
            data-testid="end-tenancy-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX_LENGTH}
            rows={3}
            placeholder="e.g. Lease not renewed, moved out on schedule"
            className="w-full px-3 py-2 text-sm border rounded-md resize-none"
          />
          <p className="text-right text-xs text-muted-foreground">
            {reason.length}/{REASON_MAX_LENGTH}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="end-tenancy-cancel"
            onClick={onClose}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="end-tenancy-confirm"
            isLoading={isLoading}
            loadingText="Ending..."
            onClick={() => void handleConfirm()}
          >
            End tenancy
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
