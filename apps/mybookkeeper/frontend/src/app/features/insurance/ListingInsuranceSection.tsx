import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useGetInsurancePoliciesQuery } from "@/shared/store/insurancePoliciesApi";
import Button from "@/shared/components/ui/Button";
import InsuranceExpirationBadge from "@/app/features/insurance/InsuranceExpirationBadge";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";

interface Props {
  listingId: string;
  canWrite: boolean;
}

/**
 * Insurance section embedded in the listing detail page.
 *
 * Shows a summary list of policies for this listing with expiration badges,
 * plus an "Add policy" button.
 */
export default function ListingInsuranceSection({ listingId, canWrite }: Props) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { data, isLoading, isError } = useGetInsurancePoliciesQuery({
    listing_id: listingId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" data-testid="listing-insurance-loading">
        <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="listing-insurance-error">
        Couldn't load insurance policies.
      </p>
    );
  }

  const policies = data?.items ?? [];

  return (
    <div className="space-y-3" data-testid="listing-insurance-section">
      {policies.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="listing-insurance-empty">
          No policies on this listing yet — add one to track coverage and expiration.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="listing-insurance-list">
          {policies.map((policy) => (
            <li key={policy.id} className="border rounded-md px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/insurance-policies/${policy.id}`}
                    className="font-medium text-primary hover:underline truncate block"
                    data-testid={`insurance-policy-link-${policy.id}`}
                  >
                    {policy.policy_name}
                  </Link>
                  {policy.carrier ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{policy.carrier}</p>
                  ) : null}
                </div>
                <InsuranceExpirationBadge expirationDate={policy.expiration_date} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          data-testid="add-insurance-policy-button"
        >
          <Plus size={14} className="mr-1" />
          Add policy
        </Button>
      ) : null}

      {showAddDialog ? (
        <AddInsurancePolicyDialog
          listingId={listingId}
          onClose={() => setShowAddDialog(false)}
        />
      ) : null}
    </div>
  );
}
