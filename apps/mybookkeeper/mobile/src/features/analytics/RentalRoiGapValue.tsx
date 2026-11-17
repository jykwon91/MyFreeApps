import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { describeGap, formatSignedMoneyCents } from "@mybookkeeper/api-client/utils/rentalRoi";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";

export interface RentalRoiGapValueProps {
  cents: number;
  basis: RentalRoiProperty["gap_basis"];
}

/** Signed amount plus the gap in words, so it never relies on color alone. */
export default function RentalRoiGapValue({ cents, basis }: RentalRoiGapValueProps) {
  const { colors, fontSize } = useTheme();
  const words = describeGap(cents);
  const caption = basis === "break_even" ? MESSAGES.gapVsBreakEven(words) : words;
  const signed = formatSignedMoneyCents(cents);
  return (
    <View>
      <Text
        accessibilityLabel={`${signed} ${caption}`}
        style={{
          fontSize: fontSize.md,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
          color: cents >= 0 ? colors.positiveText : colors.destructiveText,
        }}
      >
        {signed}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{caption}</Text>
    </View>
  );
}
