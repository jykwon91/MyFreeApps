import { useState } from "react";
import { Button, ConfirmDialog, showError, showSuccess } from "@platform/ui";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useGetUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { useDeleteUtilityPlanMutation } from "@mybookkeeper/api-client/store/utilityPlansApi";
import AddUtilityPlanDialog from "@/app/features/utility/AddUtilityPlanDialog";
import BetterPlansSection from "@/app/features/utility/BetterPlansSection";
import MarketRateBenchmarkDialog from "@/app/features/utility/MarketRateBenchmarkDialog";
import MarketRateBenchmarkSummary from "@/app/features/utility/MarketRateBenchmarkSummary";
import EditUtilityPlanDialog from "@/app/features/utility/EditUtilityPlanDialog";
import UtilityPlansListBody from "@/app/features/utility/UtilityPlansListBody";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

/**
 * All-plans view: every utility contract across every property.
 *
 * The list intentionally includes superseded plans — the previous rate is what
 * a new offer gets compared against — so each row says whether it is current.
 */
export default function UtilityPlans() {
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBenchmarkDialog, setShowBenchmarkDialog] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [planPendingDelete, setPlanPendingDelete] = useState<UtilityPlanSummary | null>(null);

  const { data, error, isFetching, refetch } = useGetUtilityPlansQuery({});
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

  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: plans.length,
  });

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
    // Wider than the app's usual `max-w-3xl`: this page puts a current plan
    // beside a stat-grid comparison, and at 3xl the grid collapses to two
    // columns and the rail drops below the offers it exists to anchor.
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <SectionHeader
        title="Utility Plans"
        subtitle="Track what each property pays for power and gas, get warned before a fixed rate lapses, and check the live market for a better rate."
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setShowBenchmarkDialog(true)}
              data-testid="record-market-rate-button"
            >
              Market rate
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setShowAddDialog(true)}
              data-testid="add-utility-plan-button"
            >
              Add plan
            </Button>
          </div>
        }
      />

      {error ? (
        <LoadErrorAlert message="Couldn't load utility plans." isRetrying={isFetching} onRetry={() => void refetch()} />
      ) : null}

      <MarketRateBenchmarkSummary onEdit={() => setShowBenchmarkDialog(true)} />

      <BetterPlansSection />

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
        onEdit={(plan) => setEditingPlanId(plan.id)}
        onDelete={(plan) => setPlanPendingDelete(plan)}
      />

      {showAddDialog ? (
        <AddUtilityPlanDialog onClose={() => setShowAddDialog(false)} />
      ) : null}

      {showBenchmarkDialog ? (
        <MarketRateBenchmarkDialog onClose={() => setShowBenchmarkDialog(false)} />
      ) : null}

      {editingPlanId ? (
        <EditUtilityPlanDialog
          planId={editingPlanId}
          onClose={() => setEditingPlanId(null)}
        />
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
