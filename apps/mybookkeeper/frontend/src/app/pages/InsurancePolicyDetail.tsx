import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  useDeleteInsurancePolicyMutation,
  useGetInsurancePolicyByIdQuery,
} from "@/shared/store/insurancePoliciesApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import InsuranceExpirationBadge from "@/app/features/insurance/InsuranceExpirationBadge";
import InsurancePolicyAttachmentsSection from "@/app/features/insurance/InsurancePolicyAttachmentsSection";
import InsurancePolicyDetailSkeleton from "@/app/features/insurance/InsurancePolicyDetailSkeleton";

function formatCoverage(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

export default function InsurancePolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePolicy, { isLoading: isDeleting }] = useDeleteInsurancePolicyMutation();

  const {
    data: policy,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetInsurancePolicyByIdQuery(policyId ?? "", { skip: !policyId });

  async function handleDelete() {
    if (!policy) return;
    try {
      await deletePolicy(policy.id).unwrap();
      showSuccess("Insurance policy deleted.");
      navigate("/insurance-policies");
    } catch {
      showError("Couldn't delete the policy. Please try again.");
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/insurance-policies"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to insurance policies
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load this policy. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading || !policy ? (
        !isError ? <InsurancePolicyDetailSkeleton /> : null
      ) : (
        <>
          <SectionHeader
            title={policy.policy_name}
            subtitle={
              <span className="inline-flex items-center gap-2 flex-wrap">
                {policy.carrier ? (
                  <span className="text-sm text-muted-foreground">{policy.carrier}</span>
                ) : null}
                <InsuranceExpirationBadge expirationDate={policy.expiration_date} />
              </span>
            }
            actions={
              canWrite ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  data-testid="delete-insurance-policy-button"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              ) : null
            }
          />

          <section className="border rounded-lg p-4 space-y-3" data-testid="insurance-policy-details">
            <h2 className="text-sm font-medium">Policy details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Policy number</dt>
                <dd className="font-medium" data-testid="insurance-policy-number">
                  {policy.policy_number ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Coverage amount</dt>
                <dd className="font-medium" data-testid="insurance-coverage-amount">
                  {formatCoverage(policy.coverage_amount_cents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Effective date</dt>
                <dd data-testid="insurance-effective-date">{formatDate(policy.effective_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Expiration date</dt>
                <dd data-testid="insurance-expiration-date">{formatDate(policy.expiration_date)}</dd>
              </div>
            </dl>
            {policy.notes ? (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-line" data-testid="insurance-notes">
                  {policy.notes}
                </p>
              </div>
            ) : null}
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">Documents</h2>
            <InsurancePolicyAttachmentsSection
              policyId={policy.id}
              attachments={policy.attachments}
              canWrite={canWrite}
            />
          </section>

          {showDeleteConfirm ? (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              data-testid="delete-insurance-policy-confirm"
            >
              <div className="bg-background rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
                <h3 className="text-base font-semibold">Delete policy?</h3>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>{policy.policy_name}</strong> and all
                  attached documents. This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <LoadingButton
                    variant="primary"
                    size="md"
                    isLoading={isDeleting}
                    loadingText="Deleting..."
                    onClick={() => void handleDelete()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="confirm-delete-insurance-policy"
                  >
                    Delete
                  </LoadingButton>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
