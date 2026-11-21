import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, LoadingButton, ModalDialog, showError, showSuccess } from "@platform/ui";
import { TENANCY_END_REASON_MAX_LENGTH } from "@mybookkeeper/api-client/constants/tenancy";
import { useEndTenancyMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import { hasHttpStatus } from "@/shared/utils/http-status";

export interface EndTenancyDialogProps {
  applicantId: string;
  tenantName: string;
  onClose: () => void;
}

/**
 * Inline dialog to confirm ending a tenant's tenancy.
 * Posts PATCH /applicants/{id}/tenancy/end with an optional reason.
 */
export default function EndTenancyDialog({ applicantId, tenantName, onClose }: EndTenancyDialogProps) {
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
    } catch (error) {
      if (hasHttpStatus(error, 409)) {
        showError("That tenancy changed since you opened it.");
        onClose();
        return;
      }
      showError("Couldn't end the tenancy. Please try again.");
    }
  }

  return (
    <ModalDialog
      testId="end-tenancy-dialog"
      onClose={onClose}
      hasDescription
      panelClassName="bg-card rounded-lg shadow-lg p-6 w-full max-w-md space-y-4"
    >
      <Dialog.Title className="text-base font-semibold">End tenancy</Dialog.Title>
      <Dialog.Description className="text-sm text-muted-foreground">
        You're ending the tenancy for{" "}
        <span className="font-medium text-foreground">{tenantName}</span>.
        They'll appear in the "Ended" filter until you restart their tenancy.
      </Dialog.Description>

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
          maxLength={TENANCY_END_REASON_MAX_LENGTH}
          rows={3}
          placeholder="e.g. Lease not renewed, moved out on schedule"
          className="w-full px-3 py-2 text-sm border rounded-md resize-none"
        />
        <p className="text-right text-xs text-muted-foreground">
          {reason.length}/{TENANCY_END_REASON_MAX_LENGTH}
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
    </ModalDialog>
  );
}
