import type { InsurancePremiumComparisonRow } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison-row";
import { formatBenchmarkGap } from "@mybookkeeper/api-client/utils/benchmarkFormat";
import { formatCoverageRate } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import InquiryChip from "../inquiries/InquiryChip";
import { policyPlace } from "./policyDisplay";

export default function PremiumCheckRow({ row }: { row: InsurancePremiumComparisonRow }) {
  const { colors, spacing, fontSize } = useTheme();
  const { policy } = row;
  const place = policyPlace(policy);
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{policy.policy_name}</Text>
      {place ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{place}</Text> : null}
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {INSURANCE_MESSAGES.payingVsMarket(formatCoverageRate(row.policy_rate_cents_per_1000), formatCoverageRate(row.benchmark_rate_cents_per_1000))}
        {row.benchmark_is_stale ? ` (${INSURANCE_MESSAGES.recordedAWhileAgo})` : ""}
      </Text>
      <InquiryChip label={formatBenchmarkGap(row.gap_pct)} />
    </View>
  );
}
