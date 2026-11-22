import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import { researchFailureMessage } from "../../lib/researchFailureMessage";
import { canRetryResearch } from "@myjobhunter/api-client/utils/canRetryResearch";
import { researchFailureFixedMessage } from "@myjobhunter/api-client/utils/researchFailureFixedMessage";
import type { ResearchFailedProps } from "../../types/ResearchFailedProps";

/**
 * A run that failed: why, with the server's reason as the website shows it, and Try again only when
 * trying again could work. Research that isn't set up on the server, or a company that's gone, can't; a rate limit can once a few minutes pass,
 * and a run already going elsewhere once it has finished.
 * The reason isn't announced here: the run's error toast already reads it out.
 */
export default function ResearchFailed({ failure, isRunning, onRun }: ResearchFailedProps) {
  const { colors, spacing, fontSize } = useTheme();
  const reason = failure?.reason ?? "retryable";
  const message = researchFailureMessage(reason, MESSAGES.failedBody);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
        {message}
      </Text>
      {failure?.detail && researchFailureFixedMessage(reason) === null ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {failure.detail}
        </Text>
      ) : null}
      {canRetryResearch(reason) ? (
        <LoadingButton isLoading={isRunning} loadingText={MESSAGES.running} onPress={onRun}>
          {MESSAGES.tryAgain}
        </LoadingButton>
      ) : null}
    </View>
  );
}
