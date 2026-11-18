import {
  RENTAL_ROI_BREAKDOWN_MESSAGES as MESSAGES,
  RENTAL_ROI_MORTGAGE_SOURCE_NOTES,
} from "@mybookkeeper/api-client/constants/rentalRoiBreakdown";
import type { RentalRoiCostLine } from "@mybookkeeper/api-client/types/analytics/rental-roi-cost-line";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatExactMoneyCents, rentalRoiCostLineLabel } from "@mybookkeeper/api-client/utils/rentalRoi";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import RentalRoiCostRow from "./RentalRoiCostRow";

export interface RentalRoiBreakEvenBreakdownProps {
  property: RentalRoiProperty;
}

const perMonth = (cents: number) => `${formatExactMoneyCents(cents)}/mo`;

const toRow = (line: RentalRoiCostLine) => (
  <RentalRoiCostRow key={line.category} label={rentalRoiCostLineLabel(line.category)} value={perMonth(line.monthly_cents)} />
);

/** Every line that adds up to a property's break-even. */
export default function RentalRoiBreakEvenBreakdown({ property }: RentalRoiBreakEvenBreakdownProps) {
  const { colors, fontSize, spacing } = useTheme();
  const costs = property.cost_breakdown;
  const noteStyle = { fontSize: fontSize.xs, color: colors.mutedForeground };
  return (
    <View style={{ gap: spacing.sm }} testID="rental-roi-break-even-breakdown">
      <View style={{ gap: spacing.xs }}>
        <RentalRoiCostRow isSubtotal label={MESSAGES.mortgage} value={perMonth(costs.debt_service_monthly_cents)} />
        {costs.mortgage_lines.map(toRow)}
        <Text style={noteStyle}>{RENTAL_ROI_MORTGAGE_SOURCE_NOTES[property.mortgage_source]}</Text>
      </View>
      <View style={{ gap: spacing.xs }}>
        <RentalRoiCostRow isSubtotal label={MESSAGES.operatingCosts} value={perMonth(costs.operating_monthly_cents)} />
        {costs.operating_lines.map(toRow)}
        <Text style={noteStyle}>{costs.operating_lines.length > 0 ? MESSAGES.capitalNote : MESSAGES.noOperatingCosts}</Text>
      </View>
      {costs.escrow_covered_lines.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.escrowHeading}</Text>
          {costs.escrow_covered_lines.map(toRow)}
          <Text style={noteStyle}>{MESSAGES.escrowNote}</Text>
        </View>
      )}
      <RentalRoiCostRow isSubtotal label={MESSAGES.breakEven} value={perMonth(property.break_even_monthly_cents)} />
    </View>
  );
}
