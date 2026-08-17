import { useState } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@platform/ui";
import { useGetInsurancePoliciesQuery } from "@/shared/store/insurancePoliciesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import { useInsurancePoliciesListMode } from "@/app/features/insurance/useInsurancePoliciesListMode";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import InsuranceBenchmarkDialog from "@/app/features/insurance/InsuranceBenchmarkDialog";
import InsuranceBenchmarkSummary from "@/app/features/insurance/InsuranceBenchmarkSummary";
import InsurancePoliciesListBody from "@/app/features/insurance/InsurancePoliciesListBody";
import RateWatchSection from "@/app/features/insurance/RateWatchSection";

/**
 * All-policies view: lists insurance policies across all properties.
 * Includes an "expiring soon" toggle (within 30 days).
 */
export default function InsurancePolicies() {
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBenchmarkDialog, setShowBenchmarkDialog] = useState(false);

  const expiringBefore = showExpiringSoon
    ? format(addDays(new Date(), 30), "yyyy-MM-dd")
    : undefined;

  const { data, isLoading, isError, refetch, isFetching } = useGetInsurancePoliciesQuery(
    expiringBefore ? { expiring_before: expiringBefore } : {},
  );

  const policies = data?.items ?? [];
  const mode = useInsurancePoliciesListMode({ isLoading, policyCount: policies.length });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader
        title="Insurance"
        subtitle="Track coverage and expiration across all properties."
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowAddDialog(true)}
            data-testid="add-insurance-policy-button"
          >
            Add policy
          </Button>
        }
      />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>Couldn't load insurance policies.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium hover:underline"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </AlertBox>
      ) : null}

      <InsuranceBenchmarkSummary onEdit={() => setShowBenchmarkDialog(true)} />

      {/* Expiring soon filter */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showExpiringSoon}
            onChange={(e) => setShowExpiringSoon(e.target.checked)}
            className="rounded"
            data-testid="expiring-soon-toggle"
          />
          Show expiring within 30 days only
        </label>
      </div>

      <InsurancePoliciesListBody
        mode={mode}
        policies={policies}
        showExpiringSoon={showExpiringSoon}
      />

      {/* Below the policy list, mirroring the utility page: what you hold
          first, then what the market is doing to it. */}
      <RateWatchSection />

      {showAddDialog ? (
        <AddInsurancePolicyDialog onClose={() => setShowAddDialog(false)} />
      ) : null}

      {showBenchmarkDialog ? (
        <InsuranceBenchmarkDialog onClose={() => setShowBenchmarkDialog(false)} />
      ) : null}
    </main>
  );
}
