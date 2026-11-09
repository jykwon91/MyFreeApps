import { LoadingButton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";

interface ComparisonNoticeProps {
  isLoading: boolean;
  hasFailed: boolean;
  /** What can't be shown without the earlier stretch, in the screen's own words. */
  failedMessage: string;
  onRetry: () => Promise<void>;
}

/** Says the earlier stretch is loading, or that it failed and offers another go. Nothing while it is fine. */
export default function ComparisonNotice({ isLoading, hasFailed, failedMessage, onRetry }: ComparisonNoticeProps) {
  const { colors, fontSize } = useTheme();
  if (hasFailed) {
    return (
      <>
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.foreground }}>{failedMessage}</Text>
        <LoadingButton onPress={onRetry} variant="secondary">
          {MESSAGES.retryComparison}
        </LoadingButton>
      </>
    );
  }
  if (isLoading) {
    return <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.loadingComparison}</Text>;
  }
  return null;
}
