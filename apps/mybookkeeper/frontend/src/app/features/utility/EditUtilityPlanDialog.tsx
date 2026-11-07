import { useGetUtilityPlanByIdQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import EditUtilityPlanForm from "./EditUtilityPlanForm";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import UtilityPlanFormSkeleton from "./UtilityPlanFormSkeleton";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

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
    <FormDialogShell
      title="Edit utility plan"
      testId="edit-utility-plan-dialog"
      onClose={onClose}
      width="wide"
    >
      {isLoading ? <UtilityPlanFormSkeleton /> : null}

      {isError ? (
        <div className="p-5">
          <LoadErrorAlert message="Couldn't load this plan." isRetrying={isFetching} onRetry={() => void refetch()} />
        </div>
      ) : null}

      {plan ? (
        <EditUtilityPlanForm plan={plan} onSaved={onClose} onCancel={onClose} />
      ) : null}
    </FormDialogShell>
  );
}
