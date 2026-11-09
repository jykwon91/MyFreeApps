import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";
import { formatAnnualPremium, formatCoverageRate, formatPolicyMoney } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { MARKET_MESSAGES } from "../../constants/insuranceMarket";
import { fullDateLabel } from "../../lib/localDate";
import InquiryChip from "../inquiries/InquiryChip";

export default function MarketPremiumSummary({ benchmark }: { benchmark: InsuranceBenchmark }) {
  const { colors, spacing, fontSize } = useTheme();
  const origin = [benchmark.region_label, benchmark.source, `${MARKET_MESSAGES.seen} ${fullDateLabel(benchmark.observed_on)}`].filter(Boolean).join(" · ");
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MARKET_MESSAGES.comparingAgainst}</Text>
      <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {`${formatAnnualPremium(benchmark.annual_premium_cents)} on ${formatPolicyMoney(benchmark.coverage_amount_cents)} ${MARKET_MESSAGES.coverageWord}`}
      </Text>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{formatCoverageRate(benchmark.rate_cents_per_1000_coverage)}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{origin}</Text>
      {benchmark.notes ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{benchmark.notes}</Text> : null}
      {benchmark.is_stale ? <InquiryChip label={MARKET_MESSAGES.stale} /> : null}
    </View>
  );
}
