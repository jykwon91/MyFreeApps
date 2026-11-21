import { SectionError, useAnnouncement, useTheme } from "@platform/mobile";
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
  const isShowingLoading = isLoading && !hasFailed;
  useAnnouncement(isShowingLoading ? MESSAGES.loadingComparison : undefined, "polite");
  if (hasFailed) return <SectionError message={failedMessage} onRetry={onRetry} retryLabel={MESSAGES.retryComparison} />;
  if (isShowingLoading) return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.loadingComparison}</Text>;
  return null;
}
