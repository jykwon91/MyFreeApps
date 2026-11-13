import { useState } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@platform/ui";
import { useGetInsurancePoliciesQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import InsuranceBenchmarkDialog from "@/app/features/insurance/InsuranceBenchmarkDialog";
import InsuranceBenchmarkSummary from "@/app/features/insurance/InsuranceBenchmarkSummary";
import InsurancePoliciesListBody from "@/app/features/insurance/InsurancePoliciesListBody";
import RateWatchSection from "@/app/features/insurance/RateWatchSection";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

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

  const { data, error, refetch, isFetching } = useGetInsurancePoliciesQuery(
    expiringBefore ? { expiring_before: expiringBefore } : {},
  );

  const policies = data?.items ?? [];
  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: policies.length,
  });

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
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

      {error ? (
        <LoadErrorAlert message="Couldn't load insurance policies." isRetrying={isFetching} onRetry={() => refetch()} />
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
    </div>
  );
}
