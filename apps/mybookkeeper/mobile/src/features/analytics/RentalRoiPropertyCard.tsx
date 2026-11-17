import { RENTAL_ROI_FEW_MONTHS } from "@mybookkeeper/api-client/constants/rentalRoi";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { describeGap, formatRatioPct, formatSignedMoneyCents } from "@mybookkeeper/api-client/utils/rentalRoi";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";

export interface RentalRoiPropertyCardProps {
  property: RentalRoiProperty;
}

/** Gap value: signed amount + description in words, so it never relies on color alone. */
function GapValue({ cents, basis }: { cents: number; basis: RentalRoiProperty["gap_basis"] }) {
  const { colors, fontSize } = useTheme();
  const words = describeGap(cents);
  const signed = formatSignedMoneyCents(cents);
  const isPositive = cents >= 0;
  return (
    <View>
      <Text
        accessibilityLabel={`${signed} ${basis === "break_even" ? `${words} vs. break-even` : words}`}
        style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: isPositive ? colors.positiveText : colors.destructiveText }}
      >
        {signed}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
        {basis === "break_even" ? `${words} vs. break-even` : words}
      </Text>
    </View>
  );
}

/** Notes about data quality: few months or mortgage source. */
function PropertyNotes({ property }: { property: RentalRoiProperty }) {
  const { colors, fontSize, spacing } = useTheme();
  const fewMonths = property.months_averaged < RENTAL_ROI_FEW_MONTHS;
  if (property.mortgage_source === "records" && !fewMonths) return null;
  return (
    <View style={{ gap: spacing.xs, flexDirection: "row", flexWrap: "wrap" }}>
      {fewMonths && (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground, backgroundColor: colors.muted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          Based on {property.months_averaged} month{property.months_averaged === 1 ? "" : "s"}
        </Text>
      )}
      {property.mortgage_source === "transactions" && (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.mortgageFromTransactions}</Text>
      )}
      {property.mortgage_source === "none" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.mortgageNone}</Text>
          <Pressable
            accessibilityLabel={MESSAGES.addMortgage}
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push("/mortgages")}
          >
            <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: "500" }}>{MESSAGES.addMortgage}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Cost breakdown details: revealed by toggling Details. */
function PropertyDetails({ property }: { property: RentalRoiProperty }) {
  const { colors, fontSize, spacing } = useTheme();
  const { cost_breakdown: costs } = property;
  return (
    <View
      accessible
      accessibilityLabel={`Cost breakdown for ${property.property_name}`}
      style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}
      testID="rental-roi-property-details"
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.mortgagePayment}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>
            {formatMoneyCents(costs.debt_service_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.operatingCosts}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>
            {formatMoneyCents(costs.operating_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.cashOnCash}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>
            {formatRatioPct(property.cash_on_cash_pct)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: "40%" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.capRate}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: "500", color: colors.foreground }}>
            {formatRatioPct(property.cap_rate_pct)}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
        {MESSAGES.avgMonths(property.months_averaged)}
      </Text>
    </View>
  );
}

/** Phone card: headline is the target or break-even; actual and gap sit below. */
export default function RentalRoiPropertyCard({ property }: RentalRoiPropertyCardProps) {
  const { colors, fontSize, radius, spacing } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasTarget = property.target_monthly_cents !== null;
  const headlineCents = property.target_monthly_cents ?? property.break_even_monthly_cents;

  return (
    <View
      accessible
      accessibilityLabel={property.property_name}
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
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {property.property_name}
      </Text>

      {/* Headline: target or break-even */}
      <View>
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
          {hasTarget ? MESSAGES.target : MESSAGES.breakEven}
        </Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>
          {formatMoneyCents(headlineCents)}/mo
        </Text>
        {!hasTarget && (
          <Pressable
            accessibilityLabel={MESSAGES.addPurchasePrice}
            accessibilityRole="link"
            hitSlop={4}
            onPress={() => router.push(`/properties/${property.property_id}/edit`)}
          >
            <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500", minHeight: 44, textAlignVertical: "center" }}>
              {MESSAGES.addPurchasePrice}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Actual + gap row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <View>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.actual}</Text>
          <Text style={{ fontSize: fontSize.md, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {formatMoneyCents(property.actual_revenue_monthly_cents)}/mo
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.gap}</Text>
          <GapValue cents={property.gap_monthly_cents} basis={property.gap_basis} />
        </View>
      </View>

      <PropertyNotes property={property} />

      {/* Details toggle */}
      <Pressable
        accessibilityLabel={expanded ? MESSAGES.hideDetailsHintFor(property.property_name) : MESSAGES.detailsHintFor(property.property_name)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        hitSlop={4}
        onPress={() => setExpanded((v) => !v)}
        style={{ minHeight: 44, justifyContent: "center" }}
        testID={`rental-roi-toggle-${property.property_id}`}
      >
        <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500" }}>
          {expanded ? MESSAGES.hideDetails : MESSAGES.details}
        </Text>
      </Pressable>

      {expanded && <PropertyDetails property={property} />}
    </View>
  );
}
