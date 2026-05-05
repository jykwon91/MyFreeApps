import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetInsurancePolicyByIdQuery } from "@/shared/store/insurancePoliciesApi";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useInsurancePolicyDetailMode } from "@/app/features/insurance/useInsurancePolicyDetailMode";
import InsurancePolicyDetailBody from "@/app/features/insurance/InsurancePolicyDetailBody";

export default function InsurancePolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();

  const {
    data: policy,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetInsurancePolicyByIdQuery(policyId ?? "", { skip: !policyId });

  const mode = useInsurancePolicyDetailMode({ isLoading, isError, policy });

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

      <InsurancePolicyDetailBody mode={mode} policy={policy} />
    </main>
  );
}
