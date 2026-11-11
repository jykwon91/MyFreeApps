import { useGetCompanyResearchQuery, useTriggerCompanyResearchMutation } from "@myjobhunter/api-client/store/companiesApi";
import { companyResearchMode } from "@myjobhunter/api-client/utils/companyResearchMode";
import { researchRunFailure } from "@myjobhunter/api-client/utils/researchRunFailure";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { useTheme, useToast } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import { researchFailureMessage } from "../../lib/researchFailureMessage";
import type { CompanyResearchSectionProps } from "../../types/CompanyResearchSectionProps";
import SectionError from "../applicationDetail/SectionError";
import SectionHeading from "../applicationDetail/SectionHeading";
import ResearchBody from "./ResearchBody";
import ResearchSkeleton from "./ResearchSkeleton";

/** The website's AI research panel: run it, see it, run it again. */
export default function CompanyResearchSection({ companyId, companyName }: CompanyResearchSectionProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const query = useGetCompanyResearchQuery(companyId);
  const [triggerResearch, run] = useTriggerCompanyResearchMutation();
  const mode = companyResearchMode({
    research: query.data,
    isQueryError: query.isError,
    queryErrorStatus: isNotFound(query.error) ? 404 : undefined,
    isMutationLoading: run.isLoading,
    isMutationError: run.isError,
  });

  async function runResearch(): Promise<void> {
    try {
      await triggerResearch(companyId).unwrap();
      showToast(MESSAGES.ready);
    } catch (error) {
      showToast(researchFailureMessage(researchRunFailure(error).reason, MESSAGES.couldntRun), "error");
    }
  }

  // The website shows Run research until the first answer; the phone shows where the research will be.
  const isFirstLoad = mode === "no-research" && !query.data && query.isFetching;
  // A failed GET offers to load it again; only a failed run offers to run it again.
  const couldntLoad = mode === "failed" && !run.isError;

  return (
    <View style={{ gap: spacing.md }} testID="company-research">
      <SectionHeading title={MESSAGES.heading} />
      {isFirstLoad ? (
        <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar">
          <ResearchSkeleton />
        </View>
      ) : couldntLoad ? (
        <SectionError
          message={MESSAGES.couldntLoad}
          onRetry={async () => {
            await query.refetch();
          }}
          retryLabel={MESSAGES.tryAgain}
        />
      ) : (
        <ResearchBody
          companyName={companyName}
          failure={run.error ? researchRunFailure(run.error) : null}
          isRunning={run.isLoading}
          mode={mode}
          onRun={runResearch}
          research={query.data}
        />
      )}
    </View>
  );
}
