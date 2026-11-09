import { INSURANCE_BENCHMARK_STATUS_LABELS } from "@mybookkeeper/api-client/constants/insuranceBenchmarkLabels";
import type { InsurancePremiumComparisonRow } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison-row";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { policyPlace } from "./policyDisplay";

export default function PremiumNotCheckedRow({ row }: { row: InsurancePremiumComparisonRow }) {
  const { colors, spacing, fontSize } = useTheme();
  const place = policyPlace(row.policy);
  return (
    <View accessible style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{row.policy.policy_name}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {[place, INSURANCE_BENCHMARK_STATUS_LABELS[row.status]].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
}
