/**
 * Company research panel — shown on the CompanyDetail page.
 *
 * Owns the data-fetching (GET /companies/{id}/research) and the
 * mutation trigger (POST /companies/{id}/research). Delegates
 * rendering to CompanyResearchPanelBody via companyResearchMode.
 */
import { extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { COMPANY_RESEARCH_READY_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import { useCompanyResearchRun } from "@myjobhunter/api-client/hooks/useCompanyResearchRun";
import { useGetCompanyResearchQuery } from "@myjobhunter/api-client/store/companiesApi";
import { companyResearchMode } from "@myjobhunter/api-client/utils/companyResearchMode";
import { canRetryResearch } from "@myjobhunter/api-client/utils/canRetryResearch";
import { researchFailureFixedMessage } from "@myjobhunter/api-client/utils/researchFailureFixedMessage";
import { researchFirstLoading } from "@myjobhunter/api-client/utils/researchFirstLoading";
import { researchLoadFailed } from "@myjobhunter/api-client/utils/researchLoadFailed";
import { researchRunFailure } from "@myjobhunter/api-client/utils/researchRunFailure";
import CompanyResearchPanelBody from "@/features/companies/CompanyResearchPanelBody";
import LoadFailedState from "@/features/companies/research/LoadFailedState";
import LoadingState from "@/features/companies/research/LoadingState";

interface CompanyResearchPanelProps {
  companyId: string;
}

export default function CompanyResearchPanel({ companyId }: CompanyResearchPanelProps) {
  const {
    data: research,
    isError: isQueryError,
    error: queryError,
    isFetching,
    refetch,
  } = useGetCompanyResearchQuery(companyId);

  // The run's state lives in the store, so leaving and reopening the company mid-run still shows it running.
  const [triggerResearch, { isLoading: isMutationLoading, isError: isMutationError, error: mutationError }] =
    useCompanyResearchRun(companyId);

  const queryErrorStatus =
    queryError && typeof queryError === "object" && "status" in queryError
      ? (queryError as { status: number }).status
      : undefined;

  const mode = companyResearchMode({
    research,
    isQueryError,
    queryErrorStatus,
    isMutationLoading,
    isMutationError,
  });

  const failureReason = mutationError ? researchRunFailure(mutationError).reason : null;
  const errorMessage = failureReason
    ? (researchFailureFixedMessage(failureReason) ?? extractErrorMessage(mutationError))
    : null;
  const canRetry = failureReason === null || canRetryResearch(failureReason);
  // A failed read retries by reading again; only a failed run offers to run again (a run is a paid AI call).
  const couldntLoad = researchLoadFailed(mode, isMutationError);
  const isFirstLoad = researchFirstLoading(mode, research, isFetching);

  async function handleRunResearch() {
    try {
      await triggerResearch(companyId).unwrap();
      showSuccess(COMPANY_RESEARCH_READY_MESSAGE);
    } catch (err) {
      showError(researchFailureFixedMessage(researchRunFailure(err).reason) ?? `Research failed: ${extractErrorMessage(err)}`);
    }
  }

  function body() {
    if (isFirstLoad) return <LoadingState />;
    if (couldntLoad) return <LoadFailedState onRetry={() => void refetch()} isRetrying={isFetching} />;
    return (
      <CompanyResearchPanelBody
        mode={mode}
        research={research}
        onRunResearch={handleRunResearch}
        isRunning={isMutationLoading}
        errorMessage={errorMessage}
        canRetry={canRetry}
      />
    );
  }

  return (
    <section>
      <h2 className="text-sm font-medium mb-3">AI Research</h2>
      <div className="border rounded-lg p-4">
        {body()}
      </div>
    </section>
  );
}
