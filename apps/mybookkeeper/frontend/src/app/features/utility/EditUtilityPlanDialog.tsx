import { useGetUtilityPlanByIdQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import EditUtilityPlanForm from "./EditUtilityPlanForm";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import UtilityPlanFormSkeleton from "./UtilityPlanFormSkeleton";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";

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
  const { currentData: plan, error, refetch, isFetching } =
    useGetUtilityPlanByIdQuery(planId);
  const mode = resolveDetailLoadMode({ hasData: plan !== undefined, hasError: error !== undefined });

  return (
    <FormDialogShell
      title="Edit utility plan"
      testId="edit-utility-plan-dialog"
      onClose={onClose}
      width="wide"
    >
      {mode === "loading" ? <UtilityPlanFormSkeleton /> : null}

      {error ? (
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
