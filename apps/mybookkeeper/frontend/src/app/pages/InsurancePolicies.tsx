import { useState } from "react";
import { Link } from "react-router-dom";
import { addDays, format } from "date-fns";
import { useGetInsurancePoliciesQuery } from "@/shared/store/insurancePoliciesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import InsuranceExpirationBadge from "@/app/features/insurance/InsuranceExpirationBadge";

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

      {isLoading ? (
        <div
          className="space-y-2 animate-pulse"
          aria-busy="true"
          data-testid="insurance-policies-loading"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="insurance-policies-empty"
        >
          {showExpiringSoon
            ? "No policies expiring within 30 days."
            : "No policies on this listing yet — add one to track coverage and expiration."}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="insurance-policies-list">
          {policies.map((policy) => (
            <li key={policy.id} className="border rounded-lg px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/insurance-policies/${policy.id}`}
                    className="font-medium text-primary hover:underline block truncate"
                    data-testid={`insurance-policy-item-${policy.id}`}
                  >
                    {policy.policy_name}
                  </Link>
                  {policy.carrier ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{policy.carrier}</p>
                  ) : null}
                  {policy.expiration_date ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Expires {format(new Date(policy.expiration_date + "T00:00:00"), "MMM d, yyyy")}
                    </p>
                  ) : null}
                </div>
                <InsuranceExpirationBadge expirationDate={policy.expiration_date} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
