import { RENTAL_ROI_FEW_MONTHS } from "@mybookkeeper/api-client/constants/rentalRoi";
import { RENTAL_ROI_BREAKDOWN_MESSAGES } from "@mybookkeeper/api-client/constants/rentalRoiBreakdown";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";

export interface RentalRoiPropertyNotesProps {
  property: RentalRoiProperty;
}

/** What the numbers are missing: few months of data, or where the mortgage came from. */
export default function RentalRoiPropertyNotes({ property }: RentalRoiPropertyNotesProps) {
  const { colors, fontSize, spacing } = useTheme();
  const fewMonths = property.months_averaged < RENTAL_ROI_FEW_MONTHS;
  if (property.mortgage_source === "records" && !fewMonths && !property.is_personal_home) return null;
  return (
    <View style={{ gap: spacing.xs, flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
      {fewMonths && (
        <Text
          style={{
            fontSize: fontSize.xs,
            color: colors.mutedForeground,
            backgroundColor: colors.muted,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}
        >
          {MESSAGES.basedOnMonths(property.months_averaged)}
        </Text>
      )}
      {property.is_personal_home && (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{RENTAL_ROI_BREAKDOWN_MESSAGES.personalHomeNote}</Text>
      )}
      {property.mortgage_source === "transactions" && (
        <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.mortgageFromTransactions}</Text>
      )}
      {property.mortgage_source === "none" && (
        <>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.mortgageNone}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/mortgages")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500" }}>{MESSAGES.addMortgage}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
