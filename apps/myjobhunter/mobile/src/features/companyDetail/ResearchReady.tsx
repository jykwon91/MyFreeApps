import { researchCompensationSignals } from "@myjobhunter/api-client/utils/researchCompensationSignals";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import type { ResearchReadyProps } from "../../types/ResearchReadyProps";
import FlagList from "../../components/FlagList";
import ResearchSources from "./ResearchSources";
import ResearchTextBlock from "./ResearchTextBlock";

/** Everything the website's research panel shows, in its order, leaving out what the run didn't find. */
export default function ResearchReady({ research }: ResearchReadyProps) {
  const { spacing } = useTheme();
  const compensation = researchCompensationSignals(research);
  return (
    <View style={{ gap: spacing.lg }}>
      {research.description ? <ResearchTextBlock label={MESSAGES.whatTheyDo} text={research.description} /> : null}
      {research.products_for_you ? <ResearchTextBlock isHighlighted label={MESSAGES.productsForYou} text={research.products_for_you} /> : null}
      {research.interview_process ? <ResearchTextBlock label={MESSAGES.summary} text={research.interview_process} /> : null}
      {research.senior_engineer_sentiment ? <ResearchTextBlock isMuted label={MESSAGES.culture} text={research.senior_engineer_sentiment} /> : null}
      {compensation ? <ResearchTextBlock isMuted label={MESSAGES.compensation} text={compensation} /> : null}
      <FlagList flags={research.green_flags} title={MESSAGES.greenFlags} tone="success" />
      <FlagList flags={research.red_flags} title={MESSAGES.redFlags} tone="danger" />
      <ResearchSources sources={research.sources} />
    </View>
  );
}
