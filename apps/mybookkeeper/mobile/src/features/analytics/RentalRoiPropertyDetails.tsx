import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { formatRatioPct } from "@mybookkeeper/api-client/utils/rentalRoi";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";
import RentalRoiDetailStat from "./RentalRoiDetailStat";

export interface RentalRoiPropertyDetailsProps {
  property: RentalRoiProperty;
}

/** The cost breakdown and returns behind a property's numbers. */
export default function RentalRoiPropertyDetails({ property }: RentalRoiPropertyDetailsProps) {
  const { colors, fontSize, spacing } = useTheme();
  const costs = property.cost_breakdown;
  return (
    <View
      style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}
      testID="rental-roi-property-details"
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <RentalRoiDetailStat label={MESSAGES.mortgagePayment} value={`${formatMoneyCents(costs.debt_service_monthly_cents)}/mo`} />
        <RentalRoiDetailStat label={MESSAGES.operatingCosts} value={`${formatMoneyCents(costs.operating_monthly_cents)}/mo`} />
        <RentalRoiDetailStat label={MESSAGES.cashOnCash} value={formatRatioPct(property.cash_on_cash_pct)} />
        <RentalRoiDetailStat label={MESSAGES.capRate} value={formatRatioPct(property.cap_rate_pct)} />
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.avgMonths(property.months_averaged)}</Text>
    </View>
  );
}
