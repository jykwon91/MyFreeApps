/**
 * Company research panel — shown on the CompanyDetail page.
 *
 * Owns the data-fetching (GET /companies/{id}/research) and the
 * mutation trigger (POST /companies/{id}/research). Delegates
 * rendering to CompanyResearchPanelBody via companyResearchMode.
 */
import { extractErrorMessage, showError } from "@platform/ui";
import { useCompanyResearchRun } from "@myjobhunter/api-client/hooks/useCompanyResearchRun";
import { useGetCompanyResearchQuery } from "@myjobhunter/api-client/store/companiesApi";
import { companyResearchMode } from "@myjobhunter/api-client/utils/companyResearchMode";
import { researchFailureFixedMessage } from "@myjobhunter/api-client/utils/researchFailureFixedMessage";
import { researchRunFailure } from "@myjobhunter/api-client/utils/researchRunFailure";
import CompanyResearchPanelBody from "@/features/companies/CompanyResearchPanelBody";

interface CompanyResearchPanelProps {
  companyId: string;
}

export default function CompanyResearchPanel({ companyId }: CompanyResearchPanelProps) {
  const {
    data: research,
    isError: isQueryError,
    error: queryError,
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
  // A 503 means research isn't set up on the server; retrying can't help.
  const canRetry = failureReason !== "not-configured";

  async function handleRunResearch() {
    try {
      await triggerResearch(companyId).unwrap();
    } catch (err) {
      showError(researchFailureFixedMessage(researchRunFailure(err).reason) ?? `Research failed: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-medium mb-3">AI Research</h2>
      <div className="border rounded-lg p-4">
        <CompanyResearchPanelBody
          mode={mode}
          research={research}
          onRunResearch={handleRunResearch}
          isRunning={isMutationLoading}
          errorMessage={errorMessage}
          canRetry={canRetry}
        />
      </div>
    </section>
  );
}
