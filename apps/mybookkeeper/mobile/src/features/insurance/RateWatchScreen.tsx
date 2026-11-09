import { useLazyGetInsuranceRateWatchQuery } from "@mybookkeeper/api-client/store/insuranceMarketApi";
import { resolveRateWatchMode } from "@mybookkeeper/api-client/utils/rateWatchMode";
import { Banner, LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { ScrollView, Text, View } from "react-native";
import { RATE_WATCH_MESSAGES } from "../../constants/insuranceRateWatch";
import RateWatchResults from "./RateWatchResults";

/**
 * The check is a button, not a page-load side effect: it reaches out to the Department of
 * Insurance, and opening a screen is no reason to call an outside service.
 */
export default function RateWatchScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const [check, { data, isFetching, isError, isUninitialized }] = useLazyGetInsuranceRateWatchQuery();
  const mode = resolveRateWatchMode({ hasChecked: !isUninitialized, isFetching, isError, outlookCount: data?.outlooks.length ?? 0 });
  const body = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
      <Text style={body}>{RATE_WATCH_MESSAGES.blurb}</Text>
      <LoadingButton isLoading={isFetching} loadingText={RATE_WATCH_MESSAGES.checking} onPress={() => void check()}>
        {RATE_WATCH_MESSAGES.check}
      </LoadingButton>
      {mode === "idle" ? <Text style={body}>{RATE_WATCH_MESSAGES.idle}</Text> : null}
      {mode === "error" ? <Banner message={RATE_WATCH_MESSAGES.error} /> : null}
      {mode === "empty" ? <Text style={body}>{RATE_WATCH_MESSAGES.empty}</Text> : null}
      {mode === "loading" ? (
        <View accessibilityLabel={RATE_WATCH_MESSAGES.loading} accessibilityRole="progressbar" style={{ gap: spacing.md }} testID="rate-watch-skeleton">
          <Skeleton height={64} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : null}
      {mode === "results" && data ? <RateWatchResults data={data} /> : null}
    </ScrollView>
  );
}
