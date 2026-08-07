import { useState } from "react";
import { Button, ConfirmDialog } from "@platform/ui";
import AlertBox from "@/shared/components/ui/AlertBox";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteUtilityPlanMutation,
  useGetUtilityPlansQuery,
} from "@/shared/store/utilityPlansApi";
import AddUtilityPlanDialog from "@/app/features/utility/AddUtilityPlanDialog";
import UtilityPlansListBody from "@/app/features/utility/UtilityPlansListBody";
import { useUtilityPlansListMode } from "@/app/features/utility/useUtilityPlansListMode";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

/**
 * All-plans view: every utility contract across every property.
 *
 * The list intentionally includes superseded plans — the previous rate is what
 * a new offer gets compared against — so each row says whether it is current.
 */
export default function UtilityPlans() {
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [planPendingDelete, setPlanPendingDelete] = useState<UtilityPlanSummary | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useGetUtilityPlansQuery({});
  const [deletePlan] = useDeleteUtilityPlanMutation();

  const allPlans = data?.items ?? [];
  // Filtered client-side rather than through ``expiring_before``: the server
  // filter keys off the raw date, but what the operator means by "needs
  // attention" is the derived status, which already accounts for rate type —
  // a regulated plan has no renewal to act on.
  const plans = showExpiringOnly
    ? allPlans.filter(
        (plan) =>
          plan.is_current &&
          (plan.renewal_status === "expired" || plan.renewal_status === "expiring_soon"),
      )
    : allPlans;

  const mode = useUtilityPlansListMode({ isLoading, planCount: plans.length });

  async function handleConfirmDelete() {
    const plan = planPendingDelete;
    if (!plan) return;
    setDeletingPlanId(plan.id);
    try {
      await deletePlan(plan.id).unwrap();
      showSuccess("Utility plan removed.");
      setPlanPendingDelete(null);
    } catch {
      showError("Couldn't remove the plan. Please try again.");
    } finally {
      setDeletingPlanId(null);
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader
        title="Utility Plans"
        subtitle="Track what each property pays for power and gas, and get warned before a fixed rate lapses."
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowAddDialog(true)}
            data-testid="add-utility-plan-button"
          >
            Add plan
          </Button>
        }
      />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>Couldn't load utility plans.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm font-medium hover:underline"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </AlertBox>
      ) : null}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showExpiringOnly}
            onChange={(e) => setShowExpiringOnly(e.target.checked)}
            className="rounded"
            data-testid="utility-plans-expiring-toggle"
          />
          Show only plans that need renewing
        </label>
      </div>

      <UtilityPlansListBody
        mode={mode}
        plans={plans}
        showExpiringOnly={showExpiringOnly}
        deletingPlanId={deletingPlanId}
        onDelete={(plan) => setPlanPendingDelete(plan)}
      />

      {showAddDialog ? (
        <AddUtilityPlanDialog onClose={() => setShowAddDialog(false)} />
      ) : null}

      <ConfirmDialog
        open={planPendingDelete !== null}
        title="Remove this utility plan?"
        description={
          planPendingDelete
            ? `${planPendingDelete.provider_name} for ${planPendingDelete.property_name ?? "this property"}. The rate history it holds is what a new offer gets compared against, so removing it leaves nothing to measure the next plan against.`
            : ""
        }
        confirmLabel="Remove plan"
        variant="danger"
        isLoading={deletingPlanId !== null}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPlanPendingDelete(null)}
      />
    </main>
  );
}
