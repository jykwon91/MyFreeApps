import type { EmailQueueItem } from "@mybookkeeper/api-client/types/integration/email-queue-item";
import { computeStatusCounts } from "@mybookkeeper/api-client/utils/emailQueue";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import type { IntegrationActions } from "../../types/IntegrationActions";
import { useCanWrite } from "../workspace/useCanWrite";

/** What the email queue is waiting on, with the two bulk actions for a writer. */
export default function QueueSummary({ queue, actions }: { queue: readonly EmailQueueItem[]; actions: IntegrationActions }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const counts = useMemo(() => computeStatusCounts(queue), [queue]);
  const isExtracting = counts.extracting > 0;
  const parts = [
    counts.pending > 0 ? MESSAGES.queuePending(counts.pending) : null,
    counts.fetched > 0 ? MESSAGES.queueFetched(counts.fetched) : null,
    isExtracting ? MESSAGES.queueExtracting(counts.extracting) : null,
    counts.failed > 0 ? MESSAGES.queueFailed(counts.failed) : null,
  ].filter(Boolean);
  const summary = parts.length > 0 ? parts.join(" · ") : queue.length > 0 ? MESSAGES.queueAllDone(queue.length) : MESSAGES.queueEmpty;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.queueHeading}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{summary}</Text>
      {canWrite && counts.fetched > 0 ? (
        <LoadingButton isLoading={isExtracting || actions.extractAll.isBusy} loadingText={MESSAGES.extractingCount(counts.extracting)} onPress={() => void actions.extractAll.run()} variant="secondary">
          {MESSAGES.extractAll(counts.fetched)}
        </LoadingButton>
      ) : null}
      {canWrite && counts.fetched === 0 && isExtracting ? (
        <LoadingButton disabled isLoading loadingText={MESSAGES.extractingCount(counts.extracting)} onPress={() => undefined} variant="secondary">
          {MESSAGES.queueExtracting(counts.extracting)}
        </LoadingButton>
      ) : null}
      {canWrite && counts.failed > 0 ? (
        <LoadingButton isLoading={actions.retryAll.isBusy} loadingText={MESSAGES.retrying} onPress={() => void actions.retryAll.run()} variant="secondary">
          {MESSAGES.retryFailed(counts.failed)}
        </LoadingButton>
      ) : null}
    </View>
  );
}
