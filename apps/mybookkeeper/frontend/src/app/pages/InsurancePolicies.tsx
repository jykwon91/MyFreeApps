import { useState } from "react";
import { addDays, format } from "date-fns";
import { useGetInsurancePoliciesQuery } from "@/shared/store/insurancePoliciesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import { useInsurancePoliciesListMode } from "@/app/features/insurance/useInsurancePoliciesListMode";
import InsurancePoliciesListBody from "@/app/features/insurance/InsurancePoliciesListBody";

/**
 * All-policies view: lists insurance policies across all listings.
 * Includes an "expiring soon" toggle (within 30 days).
 */
export default function InsurancePolicies() {
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);

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
        subtitle="Track coverage and expiration across all listings."
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
    </main>
  );
}
