import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";
import InsurancePolicyDetailBody from "@/app/features/insurance/InsurancePolicyDetailBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function InsurancePolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();

  const {
    currentData: policy,
    error,
    isFetching,
    refetch,
  } = useGetInsurancePolicyByIdQuery(policyId ?? "", { skip: !policyId });

  const mode = resolveDetailLoadMode({ hasData: policy !== undefined, hasError: error !== undefined });

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/insurance-policies"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to insurance policies
      </Link>

      {error ? (
        <LoadErrorAlert message="I couldn't load this policy. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <InsurancePolicyDetailBody mode={mode} policy={policy} />
    </main>
  );
}
