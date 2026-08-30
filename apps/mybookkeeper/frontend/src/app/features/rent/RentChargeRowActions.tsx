import { Trash2, Undo2 } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteRentChargeMutation,
  useUnwaiveRentChargeMutation,
} from "@/shared/store/rentLedgerApi";
import type { RentCharge } from "@/shared/types/rent/rent-charge";

export interface RentChargeRowActionsProps {
  charge: RentCharge;
  applicantId: string;
  onWaive: (charge: RentCharge) => void;
}

/**
 * Per-charge controls.
 *
 * Deletion is offered only for one-off charges. A schedule-generated charge
 * deleted here would simply be regenerated on the next ledger read, so the
 * button would look like it had failed; waiving is the operation that actually
 * makes a generated period stop counting.
 */
export default function RentChargeRowActions({
  charge,
  applicantId,
  onWaive,
}: RentChargeRowActionsProps) {
  const [unwaive, { isLoading: isUnwaiving }] = useUnwaiveRentChargeMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteRentChargeMutation();

  if (charge.waived_at) {
    return (
      <LoadingButton
        type="button"
        variant="secondary"
        size="sm"
        isLoading={isUnwaiving}
        loadingText="Restoring..."
        data-testid="rent-unwaive-charge-button"
        onClick={() => {
          void unwaive({ chargeId: charge.id, applicantId })
            .unwrap()
            .then(() => showSuccess("Charge restored."))
            .catch(() => showError("Couldn't restore that charge. Please try again."));
        }}
      >
        <Undo2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        Restore
      </LoadingButton>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <LoadingButton
        type="button"
        variant="secondary"
        size="sm"
        isLoading={false}
        data-testid="rent-waive-charge-button"
        onClick={() => onWaive(charge)}
      >
        Waive
      </LoadingButton>
      {charge.schedule_id === null ? (
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isRemoving}
          loadingText="Removing..."
          aria-label="Remove charge"
          data-testid="rent-delete-charge-button"
          onClick={() => {
            void remove({ chargeId: charge.id, applicantId })
              .unwrap()
              .then(() => showSuccess("Charge removed."))
              .catch(() => showError("Couldn't remove that charge. Please try again."));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </LoadingButton>
      ) : null}
    </div>
  );
}
