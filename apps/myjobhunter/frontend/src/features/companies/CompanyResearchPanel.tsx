/**
 * Company research panel — shown on the CompanyDetail page.
 *
 * Owns the data-fetching (GET /companies/{id}/research) and the
 * mutation trigger (POST /companies/{id}/research). Delegates
 * rendering to CompanyResearchPanelBody via the useCompanyResearchMode hook.
 */
import { extractErrorMessage, showError } from "@platform/ui";
import { useGetCompanyResearchQuery, useTriggerCompanyResearchMutation } from "@/lib/companiesApi";
import {
  useCompanyResearchMode,
} from "@/features/companies/useCompanyResearchMode";
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

  const [triggerResearch, { isLoading: isMutationLoading, isError: isMutationError, error: mutationError }] =
    useTriggerCompanyResearchMutation();

  const queryErrorStatus =
    queryError && typeof queryError === "object" && "status" in queryError
      ? (queryError as { status: number }).status
      : undefined;

  const mode = useCompanyResearchMode({
    research,
    isQueryError,
    queryErrorStatus,
    isMutationLoading,
    isMutationError,
  });

  const errorMessage = mutationError ? extractErrorMessage(mutationError) : null;

  async function handleRunResearch() {
    try {
      await triggerResearch(companyId).unwrap();
    } catch (err) {
      showError(`Research failed: ${extractErrorMessage(err)}`);
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
        />
      </div>
    </section>
  );
}
