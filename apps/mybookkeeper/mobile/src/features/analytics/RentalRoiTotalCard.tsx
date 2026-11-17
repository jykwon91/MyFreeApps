import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { describeGap, formatSignedMoneyCents } from "@mybookkeeper/api-client/utils/rentalRoi";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";

export interface RentalRoiTotalCardProps {
  summary: RentalRoiSummary;
}

export default function RentalRoiTotalCard({ summary }: RentalRoiTotalCardProps) {
  const { colors, fontSize, radius, spacing } = useTheme();
  const isPositive = summary.total_gap_monthly_cents >= 0;
  const gapWords = describeGap(summary.total_gap_monthly_cents);
  const gapSigned = formatSignedMoneyCents(summary.total_gap_monthly_cents);

  return (
    <View
      accessible
      style={{
        backgroundColor: colors.muted,
        borderColor: colors.border,
        borderRadius: radius.md,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
      testID="rental-roi-total-card"
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.allProperties}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.breakEven}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {formatMoneyCents(summary.total_break_even_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.target}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {summary.gap_basis === "target"
              ? `${formatMoneyCents(summary.total_target_monthly_cents)}/mo`
              : summary.properties_with_target > 0
                ? `${summary.properties_with_target} of ${summary.property_count} properties`
                : "—"}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.actual}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {formatMoneyCents(summary.total_actual_revenue_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.gap}</Text>
          <View>
            <Text
              accessibilityLabel={`${gapSigned} ${summary.gap_basis === "break_even" ? `${gapWords} vs. break-even` : gapWords}`}
              style={{ fontSize: fontSize.sm, fontWeight: "600", fontVariant: ["tabular-nums"], color: isPositive ? colors.positiveText : colors.destructiveText }}
            >
              {gapSigned}
            </Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
              {summary.gap_basis === "break_even" ? `${gapWords} vs. break-even` : gapWords}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
