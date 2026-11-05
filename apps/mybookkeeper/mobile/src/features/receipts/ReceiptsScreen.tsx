import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { RECEIPTS_LIMIT, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { useCanWrite } from "../workspace/useCanWrite";
import ReceiptGmailBanner from "./ReceiptGmailBanner";
import { moreWaitingLine, waitingLine } from "./receiptDisplay";
import ReceiptRow from "./ReceiptRow";
import ReceiptsSkeleton from "./ReceiptsSkeleton";

export default function ReceiptsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetPendingReceiptsQuery({ limit: RECEIPTS_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData?.items ?? [];
  const waiting = (currentData?.pending_count ?? 0) - rows.length;
  const gmailState = currentData?.gmail_state ?? "ready";

  // A failed load, or rows cleared while more wait on the server, isn't caught up. A failed refresh keeps
  // the last answer but says so in the header.
  const isCaughtUp = currentData !== undefined && currentData.pending_count === 0;
  const emptyList = isCaughtUp ? (
    <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  ) : isFetching ? (
    <ReceiptsSkeleton />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 && waiting > 0 ? (
          <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{moreWaitingLine(waiting)}</Text>
        ) : undefined
      }
      ListHeaderComponent={
        rows.length > 0 || (error && currentData) ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {rows.length > 0 ? (
              <>
                {canWrite ? <ReceiptGmailBanner state={gmailState} /> : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
                <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
                  {waitingLine(currentData?.pending_count ?? rows.length)}
                </Text>
              </>
            ) : null}
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ReceiptRow canSend={gmailState === "ready"} canWrite={canWrite} receipt={item} />}
      testID="receipts-list"
    />
  );
}
