import { useLazyGetMortgageRateWatchQuery } from "@mybookkeeper/api-client/store/mortgageMarketApi";
import { EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { MORTGAGE_RATE_MESSAGES as MESSAGES } from "../../constants/mortgageRates";
import { useCanWrite } from "../workspace/useCanWrite";
import RateWatchResults from "./RateWatchResults";
import RateWatchSkeleton from "./RateWatchSkeleton";

/**
 * "Can I do better than this rate". The check is explicit rather than automatic: it reaches
 * out to Freddie Mac, and opening a screen is not a reason to hit an external service.
 */
export default function RateWatchScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [check, { data, isFetching, isError, isUninitialized }] = useLazyGetMortgageRateWatchQuery();
  const runCheck = () => void check();

  function body() {
    if (isFetching) return <RateWatchSkeleton />;
    if (isUninitialized) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.idle}</Text>;
    if (isError || !data) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.error}</Text>;
    if (data.outlooks.length === 0) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.addMortgage, onPress: () => router.push("/mortgages/new") } : undefined}
          body={MESSAGES.empty}
          heading={MESSAGES.title}
        />
      );
    }
    return <RateWatchResults data={data} onRecheck={runCheck} />;
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.title}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.intro}</Text>
      </View>
      <LoadingButton isLoading={isFetching} loadingText={MESSAGES.checking} onPress={runCheck}>
        {isUninitialized ? MESSAGES.check : MESSAGES.checkAgain}
      </LoadingButton>
      {body()}
    </ScrollView>
  );
}
