import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";
import RentalRoiGapValue from "./RentalRoiGapValue";
import RentalRoiPropertyDetails from "./RentalRoiPropertyDetails";
import RentalRoiPropertyNotes from "./RentalRoiPropertyNotes";

export interface RentalRoiPropertyCardProps {
  property: RentalRoiProperty;
}

/** Phone card: break-even and target side by side (as on the web); actual and gap sit below. */
export default function RentalRoiPropertyCard({ property }: RentalRoiPropertyCardProps) {
  const { colors, fontSize, radius, spacing } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: radius.md,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
      testID="rental-roi-property-card"
    >
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {property.property_name}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <View>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.breakEven}</Text>
          <Text style={{ fontSize: fontSize.xl, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {formatMoneyCents(property.break_even_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.target}</Text>
          {property.target_monthly_cents !== null ? (
            <Text style={{ fontSize: fontSize.xl, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>
              {formatMoneyCents(property.target_monthly_cents)}/mo
            </Text>
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(property.has_purchase_price ? "/mortgages" : `/properties/${property.property_id}/edit`)}
              style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-end" }}
            >
              <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500" }}>
                {property.has_purchase_price ? MESSAGES.addLoanOriginalAmount : MESSAGES.addPurchasePrice}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <View>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.actual}</Text>
          <Text style={{ fontSize: fontSize.md, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {formatMoneyCents(property.actual_revenue_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.gap}</Text>
          <RentalRoiGapValue cents={property.gap_monthly_cents} basis={property.gap_basis} />
        </View>
      </View>

      <RentalRoiPropertyNotes property={property} />

      <Pressable
        accessibilityLabel={expanded ? MESSAGES.hideDetailsHintFor(property.property_name) : MESSAGES.detailsHintFor(property.property_name)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
        testID={`rental-roi-toggle-${property.property_id}`}
      >
        <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500" }}>
          {expanded ? MESSAGES.hideDetails : MESSAGES.details}
        </Text>
      </Pressable>

      {expanded && <RentalRoiPropertyDetails property={property} />}
    </View>
  );
}
