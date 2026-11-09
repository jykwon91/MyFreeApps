import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import type { PolicyFilter } from "../../types/PolicyFilter";
import PremiumCheckCard from "./PremiumCheckCard";

interface PoliciesHeaderProps {
  canWrite: boolean;
  filter: PolicyFilter;
  onOpenFilter: () => void;
}

/** Triage first: the answer to "am I overpaying", then the ways in and out of the list. */
export default function PoliciesHeader({ canWrite, filter, onOpenFilter }: PoliciesHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      <PremiumCheckCard />
      {canWrite ? <LoadingButton onPress={() => router.push("/insurance/new")}>{INSURANCE_MESSAGES.addPolicy}</LoadingButton> : null}
      <LoadingButton onPress={() => router.push("/insurance/market-premium")} variant="secondary">
        {INSURANCE_MESSAGES.marketPremium}
      </LoadingButton>
      <LoadingButton onPress={() => router.push("/insurance/rate-watch")} variant="secondary">
        {INSURANCE_MESSAGES.rateWatch}
      </LoadingButton>
      <View style={{ gap: spacing.xs }}>
        <LoadingButton accessibilityHint={INSURANCE_MESSAGES.filterTitle} onPress={onOpenFilter} variant="ghost">
          {INSURANCE_MESSAGES.filter}
        </LoadingButton>
        {filter === "expiring" ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.filterExpiring}</Text> : null}
      </View>
    </View>
  );
}
