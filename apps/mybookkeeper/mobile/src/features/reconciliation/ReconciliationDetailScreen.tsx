import { useListSourcesQuery } from "@mybookkeeper/api-client/store/reconciliationApi";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import { useCanWrite } from "../workspace/useCanWrite";
import ReconciliationDetailBody from "./ReconciliationDetailBody";

export default function ReconciliationDetailScreen({ id, year }: { id: string; year: number }) {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useListSourcesQuery({ tax_year: year });
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!currentData) {
    if (isFetching || !error) {
      return (
        <View accessibilityLabel={MESSAGES.detailLoading} style={{ gap: spacing.md, padding: spacing.lg }} testID="reconciliation-detail-skeleton">
          <Skeleton height={28} width="60%" />
          <Skeleton height={40} width="40%" />
          <Skeleton height={200} />
        </View>
      );
    }
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: async () => void (await refetch()) }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }

  const source = currentData.find((candidate) => candidate.id === id);
  if (!source) {
    return <EmptyState action={{ label: MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.detailGoneBody} heading={MESSAGES.detailGone} />;
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
      testID="reconciliation-detail"
    >
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <ReconciliationDetailBody canWrite={canWrite} source={source} />
    </ScrollView>
  );
}
