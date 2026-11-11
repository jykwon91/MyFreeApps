import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import { researchFailureMessage } from "../../lib/researchFailureMessage";
import type { ResearchFailedProps } from "../../types/ResearchFailedProps";

/**
 * A run that failed: why, with the server's reason as the website shows it, and Try again only when
 * trying again could work. Research that isn't set up on the server, or a company that's gone, can't.
 */
export default function ResearchFailed({ failure, isRunning, onRun }: ResearchFailedProps) {
  const { colors, spacing, fontSize } = useTheme();
  const reason = failure?.reason ?? "retryable";
  const message = researchFailureMessage(reason, MESSAGES.failedBody);
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
        {message}
      </Text>
      {failure?.detail ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {failure.detail}
        </Text>
      ) : null}
      {reason === "retryable" ? (
        <LoadingButton isLoading={isRunning} loadingText={MESSAGES.running} onPress={onRun}>
          {MESSAGES.tryAgain}
        </LoadingButton>
      ) : null}
    </View>
  );
}
