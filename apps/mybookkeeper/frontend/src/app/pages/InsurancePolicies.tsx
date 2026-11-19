import { useState } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@platform/ui";
import { useInsurancePoliciesPages } from "@mybookkeeper/api-client/hooks/useInsurancePoliciesPages";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { pagedListView } from "@/shared/lib/paged-list-view";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import InsuranceBenchmarkDialog from "@/app/features/insurance/InsuranceBenchmarkDialog";
import InsuranceBenchmarkSummary from "@/app/features/insurance/InsuranceBenchmarkSummary";
import InsurancePoliciesListBody from "@/app/features/insurance/InsurancePoliciesListBody";
import RateWatchSection from "@/app/features/insurance/RateWatchSection";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";

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

  const pages = useInsurancePoliciesPages(expiringBefore ? { expiring_before: expiringBefore } : {});
  const { mode, rows: policies } = pagedListView(pages, pages.policies);

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

      <ListPagesErrorAlert pages={pages} noun="insurance policies" loadMessage="Couldn't load insurance policies." />

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

      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
      ) : null}

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
