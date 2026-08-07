import AlertBox from "@/shared/components/ui/AlertBox";
import { useGetUtilityPlanByIdQuery } from "@/shared/store/utilityPlansApi";
import EditUtilityPlanForm from "./EditUtilityPlanForm";
import UtilityPlanDialogShell from "./UtilityPlanDialogShell";
import UtilityPlanFormSkeleton from "./UtilityPlanFormSkeleton";

export interface EditUtilityPlanDialogProps {
  planId: string;
  onClose: () => void;
}

/**
 * Modal dialog for correcting a recorded utility plan.
 *
 * The list row carries only a summary, so the full plan is fetched here: the
 * bill-credit terms and the account number are editable but absent from the
 * summary, and submitting a form seeded from partial data would blank them.
 */
export default function EditUtilityPlanDialog({
  planId,
  onClose,
}: EditUtilityPlanDialogProps) {
  const { data: plan, isLoading, isError, refetch, isFetching } =
    useGetUtilityPlanByIdQuery(planId);

  return (
    <UtilityPlanDialogShell
      title="Edit utility plan"
      testId="edit-utility-plan-dialog"
      onClose={onClose}
    >
      {isLoading ? <UtilityPlanFormSkeleton /> : null}

      {isError ? (
        <div className="p-5">
          <AlertBox variant="error" className="flex items-center justify-between gap-3">
            <span>Couldn't load this plan.</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium hover:underline"
            >
              {isFetching ? "Retrying..." : "Retry"}
            </button>
          </AlertBox>
        </div>
      ) : null}

      {plan ? (
        <EditUtilityPlanForm plan={plan} onSaved={onClose} onCancel={onClose} />
      ) : null}
    </UtilityPlanDialogShell>
  );
}
