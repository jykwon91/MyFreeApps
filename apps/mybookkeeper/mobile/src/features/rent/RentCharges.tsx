import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RENT_CHARGES_SHOWN_AT_FIRST, RENT_MESSAGES, showAllCharges } from "../../constants/rent";
import RentChargeRow from "./RentChargeRow";

export default function RentCharges({ charges }: { charges: RentCharge[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const [isShowingAll, setIsShowingAll] = useState(false);
  if (charges.length === 0) return null;

  const newestFirst = [...charges].reverse();
  const shown = isShowingAll ? newestFirst : newestFirst.slice(0, RENT_CHARGES_SHOWN_AT_FIRST);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
        {RENT_MESSAGES.chargesHeading}
      </Text>
      {shown.map((charge) => (
        <RentChargeRow charge={charge} key={charge.id} />
      ))}
      {charges.length > RENT_CHARGES_SHOWN_AT_FIRST ? (
        <LoadingButton onPress={() => setIsShowingAll(!isShowingAll)} variant="ghost">
          {isShowingAll ? RENT_MESSAGES.showFewer : showAllCharges(charges.length)}
        </LoadingButton>
      ) : null}
    </View>
  );
}
