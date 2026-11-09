import { useGetInsurancePremiumComparisonQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { INSURANCE_COMPARISON_CARD_MODES } from "@mybookkeeper/api-client/types/insurance/insurance-comparison-card-mode";
import { resolveInsuranceComparisonCardMode } from "@mybookkeeper/api-client/utils/insuranceComparisonCardMode";
import { Banner, LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { useCanWrite } from "../workspace/useCanWrite";
import PremiumCheckRow from "./PremiumCheckRow";
import PremiumNotCheckedRow from "./PremiumNotCheckedRow";

/**
 * The glance: am I overpaying? A quiet answer says what it rests on, because "nothing flagged"
 * and "nothing checked" look the same from outside and only one of them is good news.
 */
export default function PremiumCheckCard() {
  const { colors, spacing, radius, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { data, isLoading, isError, isFetching, refetch } = useGetInsurancePremiumComparisonQuery();
  const mode = resolveInsuranceComparisonCardMode({
    isLoading,
    isError: isError && !data,
    totalAboveMarket: data?.total_above_market,
    hasAnyPolicies: (data?.total_considered ?? 0) > 0,
    hasBenchmark: data?.benchmark != null,
  });
  const box = { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md } as const;
  const heading = { fontSize: fontSize.md, fontWeight: "600", color: colors.foreground } as const;
  const body = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;

  if (mode === INSURANCE_COMPARISON_CARD_MODES.HIDDEN) return null;
  if (mode === INSURANCE_COMPARISON_CARD_MODES.LOADING) {
    return (
      <View accessibilityLabel={INSURANCE_MESSAGES.premiumCheck} accessibilityRole="progressbar" style={box} testID="premium-check-skeleton">
        <Skeleton height={20} width="40%" />
        <Skeleton height={14} />
      </View>
    );
  }
  if (mode === INSURANCE_COMPARISON_CARD_MODES.ERROR) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Banner message={INSURANCE_MESSAGES.couldntCompare} />
        <LoadingButton isLoading={isFetching} onPress={() => void refetch()} variant="secondary">
          {INSURANCE_MESSAGES.tryAgain}
        </LoadingButton>
      </View>
    );
  }
  if (mode === INSURANCE_COMPARISON_CARD_MODES.NO_BENCHMARK) {
    return (
      <View style={box}>
        <Text accessibilityRole="header" style={heading}>{INSURANCE_MESSAGES.premiumCheck}</Text>
        <Text style={body}>{INSURANCE_MESSAGES.noBenchmark}</Text>
        {canWrite ? (
          <LoadingButton onPress={() => router.push("/insurance/market-premium")} variant="secondary">
            {INSURANCE_MESSAGES.noBenchmarkAction}
          </LoadingButton>
        ) : null}
      </View>
    );
  }
  if (!data) return null;
  const isClear = mode === INSURANCE_COMPARISON_CARD_MODES.CLEAR;
  return (
    <View style={box} testID="premium-check">
      <Text accessibilityRole="header" style={heading}>
        {isClear ? INSURANCE_MESSAGES.premiumCheck : `${INSURANCE_MESSAGES.aboveMarket} (${data.total_above_market})`}
      </Text>
      {isClear ? <Text style={body}>{INSURANCE_MESSAGES.clearBody(data.material_gap_pct)}</Text> : data.above_market.map((row) => <PremiumCheckRow key={row.policy.id} row={row} />)}
      {data.has_stale_benchmark ? <Text style={body}>{isClear ? INSURANCE_MESSAGES.staleClear : INSURANCE_MESSAGES.staleAbove}</Text> : null}
      {data.not_compared.length > 0 ? (
        <View style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>{`${INSURANCE_MESSAGES.checkedAgainst} (${data.not_compared.length})`}</Text>
          {data.not_compared.map((row) => (
            <PremiumNotCheckedRow key={row.policy.id} row={row} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
