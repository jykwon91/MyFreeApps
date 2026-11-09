import { groupBySession } from "@mybookkeeper/api-client/utils/emailQueue";
import { Banner, EmptyState, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useCanWrite } from "../workspace/useCanWrite";
import GmailActions from "./GmailActions";
import GmailLabelRow from "./GmailLabelRow";
import GmailStatusCard from "./GmailStatusCard";
import IntegrationsSkeleton from "./IntegrationsSkeleton";
import QueueSummary from "./QueueSummary";
import SyncLogRow from "./SyncLogRow";
import { useGmailActions } from "./useGmailActions";
import { useIntegrationsData } from "./useIntegrationsData";

export default function IntegrationsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { integrations, gmail, connection, logs, queue, refresh: refreshAll } = useIntegrationsData();
  const actions = useGmailActions();
  const { refresh, refreshControl } = useRefresh(refreshAll, integrations.error ?? logs.error ?? queue.error);
  const history = logs.currentData ?? [];
  const queueItems = queue.currentData;
  const latest = history[0] ?? null;
  const isSyncing = latest?.status === "running";
  const itemCounts = useMemo(() => new Map(groupBySession(queueItems ?? []).map((group) => [group.syncLogId, group.items.length])), [queueItems]);

  if (!integrations.currentData) {
    return integrations.error && !integrations.isFetching ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />
    ) : (
      <IntegrationsSkeleton />
    );
  }

  const isLinked = connection !== "none";
  const historyEmpty = !logs.currentData ? (
    logs.error && !logs.isFetching ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.historyCouldntLoad} />
    ) : (
      <View accessible accessibilityLabel={MESSAGES.historyLoading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="sync-history-skeleton">
        <Skeleton height={56} />
        <Skeleton height={56} />
      </View>
    )
  ) : (
    <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.historyNone}</Text>
  );

  return (
    <FlatList
      ListEmptyComponent={isLinked ? historyEmpty : undefined}
      ListFooterComponent={
        isLinked ? <Text style={{ padding: spacing.lg, fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.intro}</Text> : undefined
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.lg, padding: spacing.lg }}>
          {integrations.error || (logs.error && logs.currentData) || (queue.error && queueItems) ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          <GmailStatusCard connection={connection} gmail={gmail} runningSync={isSyncing ? latest : null} />
          {connection === "connected" && canWrite ? <GmailActions actions={actions} isSyncing={isSyncing} latestSyncLogId={latest?.id ?? null} /> : null}
          {isLinked && !canWrite ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text> : null}
          {isLinked ? <GmailLabelRow label={gmail?.gmail_label ?? ""} /> : null}
          {isLinked && queueItems ? <QueueSummary actions={actions} queue={queueItems} /> : null}
          {isLinked && !queueItems && queue.error && !queue.isFetching ? (
            <Banner actions={[{ label: MESSAGES.tryAgain, onPress: refresh }]} message={MESSAGES.queueCouldntLoad} />
          ) : null}
          {isLinked && !queueItems && !queue.error ? <Skeleton height={44} /> : null}
          {isLinked ? (
            <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
              {MESSAGES.historyHeading}
            </Text>
          ) : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={isLinked ? history : []}
      keyExtractor={(log) => String(log.id)}
      refreshControl={refreshControl}
      renderItem={({ item }) => <SyncLogRow itemCount={queueItems ? (itemCounts.get(item.id) ?? 0) : null} log={item} onPress={() => router.push(`/integrations/sync/${item.id}`)} />}
      testID="integrations-list"
    />
  );
}
