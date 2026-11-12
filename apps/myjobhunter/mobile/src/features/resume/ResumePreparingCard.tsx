import { IMPROVEMENT_SEVERITY_LABELS } from "@myjobhunter/api-client/constants/improvementSeverityLabels";
import { IMPROVEMENT_SEVERITY_TONES } from "@myjobhunter/api-client/constants/improvementSeverityTones";
import { useRetryPreparationMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { refinementPreparation } from "@myjobhunter/api-client/utils/refinementPreparation";
import { Chip, LoadingButton, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { ActivityIndicator, Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import { refinementFailure } from "../../lib/refinementFailure";
import type { ResumeSessionCardProps } from "../../types/ResumeSessionCardProps";
import ResumeCard from "./ResumeCard";
import ResumeProgressBar from "./ResumeProgressBar";

/**
 * The background preparation, from the session alone so it's right after leaving and coming back:
 * the review running, then the suggestions being drafted, or a failure to retry. Progress is only
 * shown once there's something to count.
 */
export default function ResumePreparingCard({ session }: ResumeSessionCardProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [retryPreparation, { isLoading: isRetrying }] = useRetryPreparationMutation();
  const preparation = refinementPreparation(session);
  const heading =
    preparation.stage === "failed" ? MESSAGES.failedHeading : preparation.stage === "critiquing" ? MESSAGES.critiquingHeading : MESSAGES.draftingHeading(preparation.total);
  useAnnouncement(heading);

  async function retry(): Promise<void> {
    try {
      await retryPreparation(session.id).unwrap();
    } catch (error) {
      showToast(refinementFailure(error), "error");
    }
  }

  const title = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      {preparation.stage === "failed" ? null : <ActivityIndicator color={colors.primary} />}
      <Text accessibilityRole="header" style={{ flexShrink: 1, color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {heading}
      </Text>
    </View>
  );
  const body = (text: string) => <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{text}</Text>;

  if (preparation.stage === "failed") {
    return (
      <ResumeCard testID="resume-preparing" tone="danger">
        {title}
        {body(MESSAGES.failedBody)}
        <LoadingButton isLoading={isRetrying} loadingText={MESSAGES.retrying} onPress={retry}>
          {MESSAGES.tryAgain}
        </LoadingButton>
      </ResumeCard>
    );
  }
  if (preparation.stage === "critiquing") {
    return (
      <ResumeCard testID="resume-preparing">
        {title}
        {body(MESSAGES.critiquingBody)}
      </ResumeCard>
    );
  }
  const { total, ready, severities } = preparation;
  return (
    <ResumeCard testID="resume-preparing">
      {title}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {severities.map(({ severity, count }) => (
          <Chip key={severity} label={MESSAGES.severityCount(count, IMPROVEMENT_SEVERITY_LABELS[severity])} tone={IMPROVEMENT_SEVERITY_TONES[severity]} />
        ))}
      </View>
      <ResumeProgressBar accessibilityLabel={MESSAGES.draftedProgress(ready, total)} completed={ready} total={total} />
      {body(MESSAGES.draftingBody(ready, total))}
    </ResumeCard>
  );
}
