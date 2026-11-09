import { useDeleteInsuranceBenchmarkMutation, useGetInsuranceBenchmarkQuery } from "@mybookkeeper/api-client/store/insuranceBenchmarksApi";
import { EmptyState, LoadingButton, Skeleton, useRefresh, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { MARKET_MESSAGES } from "../../constants/insuranceMarket";
import { useCanWrite } from "../workspace/useCanWrite";
import { marketRemoveFailure } from "./marketFailure";
import MarketPremiumSheet from "./MarketPremiumSheet";
import MarketPremiumSummary from "./MarketPremiumSummary";

export default function MarketPremiumScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const { currentData: benchmark, error, isFetching, refetch } = useGetInsuranceBenchmarkQuery();
  const [removeBenchmark, { isLoading: isRemoving }] = useDeleteInsuranceBenchmarkMutation();
  const [isEditing, setIsEditing] = useState(false);
  const isRemovingNow = useRef(false);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  async function remove(): Promise<void> {
    if (isRemovingNow.current) return;
    isRemovingNow.current = true;
    try {
      await removeBenchmark().unwrap();
      showToast(MARKET_MESSAGES.removed);
    } catch (failure) {
      showToast(marketRemoveFailure(failure), "error");
    } finally {
      isRemovingNow.current = false;
    }
  }

  function confirmRemove(): void {
    Alert.alert(MARKET_MESSAGES.removeTitle, MARKET_MESSAGES.removeBody, [
      { text: MARKET_MESSAGES.cancel, style: "cancel" },
      { text: MARKET_MESSAGES.remove, style: "destructive", onPress: () => void remove() },
    ]);
  }

  if (benchmark === undefined && (isFetching || !error)) {
    return (
      <View accessibilityLabel={MARKET_MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }} testID="market-premium-skeleton">
        <Skeleton height={20} width="40%" />
        <Skeleton height={28} />
        <Skeleton height={44} />
      </View>
    );
  }
  if (benchmark === undefined) {
    return <EmptyState action={{ label: MARKET_MESSAGES.tryAgain, onPress: refresh }} body={MARKET_MESSAGES.tryAgainOffer} heading={MARKET_MESSAGES.couldntLoad} />;
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MARKET_MESSAGES.blurb}</Text>
      {benchmark ? <MarketPremiumSummary benchmark={benchmark} /> : <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{MARKET_MESSAGES.none}</Text>}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isRemoving} onPress={() => setIsEditing(true)}>
            {benchmark ? MARKET_MESSAGES.update : MARKET_MESSAGES.record}
          </LoadingButton>
          {benchmark ? (
            <LoadingButton isLoading={isRemoving} loadingText={MARKET_MESSAGES.removing} onPress={confirmRemove} variant="ghost">
              {MARKET_MESSAGES.remove}
            </LoadingButton>
          ) : null}
        </View>
      ) : null}
      {isEditing ? <MarketPremiumSheet existing={benchmark} onClose={() => setIsEditing(false)} /> : null}
    </ScrollView>
  );
}
