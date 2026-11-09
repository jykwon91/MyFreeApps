import { integrationsApi, useGetEmailQueueQuery, useGetSyncLogsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import { syncPollInterval } from "@mybookkeeper/api-client/utils/syncPollInterval";
import { Banner, EmptyState, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useScreenFocused } from "../../lib/useScreenFocused";
import QueueItemRow from "./QueueItemRow";
import SyncSessionFacts from "./SyncSessionFacts";
import SyncSessionSkeleton from "./SyncSessionSkeleton";
import { noItemsMessage, partialItemsMessage } from "./syncSessionDisplay";
import { useGmailActions } from "./useGmailActions";

/** One sync: its numbers and error, and the emails it queued. The website shows this inline; the phone gives it a screen. */
export default function SyncSessionScreen({ id }: { id: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const isFocused = useScreenFocused();
  // Only this sync matters here: a finished one with nothing left to read has no reason to be re-read often.
  const cachedLogs = integrationsApi.endpoints.getSyncLogs.useQueryState().data;
  const cachedQueue = integrationsApi.endpoints.getEmailQueue.useQueryState().data;
  const pollingInterval = isFocused
    ? syncPollInterval(
        cachedLogs?.filter((candidate) => candidate.id === id),
        cachedQueue?.filter((item) => item.sync_log_id === id),
      )
    : 0;
  const logs = useGetSyncLogsQuery(undefined, { pollingInterval, skipPollingIfUnfocused: true });
  const queue = useGetEmailQueueQuery(undefined, { pollingInterval, skipPollingIfUnfocused: true });
  const { cancel } = useGmailActions();
  const { refresh, refreshControl } = useRefresh(async () => {
    await Promise.all([logs.refetch(), queue.refetch()]);
  }, logs.error ?? queue.error);
  const log = logs.currentData?.find((candidate) => candidate.id === id);

  if (!logs.currentData) {
    return logs.error && !logs.isFetching ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.sessionCouldntLoad} />
    ) : (
      <SyncSessionSkeleton />
    );
  }
  if (!log) {
    return <EmptyState action={{ label: MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.sessionMaybeGone} heading={MESSAGES.sessionCantFind} />;
  }

  const items = queue.currentData?.filter((item) => item.sync_log_id === id);
  const partial = items ? partialItemsMessage(log, items.length) : null;
  const itemsEmpty = !items ? (
    queue.error && !queue.isFetching ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.itemsCouldntLoad} />
    ) : (
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={56} />
      </View>
    )
  ) : (
    <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{noItemsMessage(log)}</Text>
  );

  return (
    <FlatList
      ListEmptyComponent={itemsEmpty}
      ListFooterComponent={
        partial ? <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{partial}</Text> : undefined
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.lg, padding: spacing.lg }}>
          {logs.error || queue.error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          <SyncSessionFacts cancel={cancel} log={log} />
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.itemsHeading}
          </Text>
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <QueueItemRow item={item} />}
      testID="sync-session-list"
    />
  );
}
