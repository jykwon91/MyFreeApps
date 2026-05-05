import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { InsurancePoliciesListMode } from "@/shared/types/insurance/insurance-policies-list-mode";
import type { InsurancePolicySummary } from "@/shared/types/insurance/insurance-policy-summary";
import InsuranceExpirationBadge from "./InsuranceExpirationBadge";

export interface InsurancePoliciesListBodyProps {
  mode: InsurancePoliciesListMode;
  policies: InsurancePolicySummary[];
  showExpiringSoon: boolean;
}

export default function InsurancePoliciesListBody({
  mode,
  policies,
  showExpiringSoon,
}: InsurancePoliciesListBodyProps) {
  switch (mode) {
    case "loading":
      return (
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
      );
    case "empty":
      return (
        <p
          className="text-sm text-muted-foreground"
          data-testid="insurance-policies-empty"
        >
          {showExpiringSoon
            ? "No policies expiring within 30 days."
            : "No policies on this listing yet — add one to track coverage and expiration."}
        </p>
      );
    case "list":
      return (
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
      );
  }
}
