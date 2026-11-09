import { useLazyFindBetterUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityOffersApi";
import { betterPlansMode } from "@mybookkeeper/api-client/utils/betterPlansMode";
import { EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import { useCanWrite } from "../workspace/useCanWrite";
import BetterPlansResults from "./BetterPlansResults";
import BetterPlansSkeleton from "./BetterPlansSkeleton";

/**
 * "Can I do better than what I pay". The search is explicit: it reaches out to Power to Choose
 * once per property ZIP, and opening a screen is not a reason to hit an external service.
 */
export default function BetterPlansScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [search, { data, isFetching, isError, isUninitialized }] = useLazyFindBetterUtilityPlansQuery();
  const runSearch = () => void search({});
  const mode = betterPlansMode({ hasSearched: !isUninitialized, isFetching, isError, groupCount: data?.groups.length ?? 0 });

  function body() {
    switch (mode) {
      case "loading":
        return <BetterPlansSkeleton />;
      case "idle":
        return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.idle}</Text>;
      case "error":
        return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.error}</Text>;
      case "empty":
        return (
          <EmptyState
            action={canWrite ? { label: MESSAGES.addPlan, onPress: () => router.push("/utility-plans/new") } : undefined}
            body={MESSAGES.empty}
            heading={MESSAGES.emptyHeading}
          />
        );
      case "results":
        return data ? <BetterPlansResults data={data} /> : null;
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.title}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.intro}</Text>
      </View>
      <LoadingButton isLoading={isFetching} loadingText={MESSAGES.checking} onPress={runSearch}>
        {isUninitialized ? MESSAGES.check : MESSAGES.checkAgain}
      </LoadingButton>
      {body()}
    </ScrollView>
  );
}
