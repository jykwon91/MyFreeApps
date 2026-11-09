import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RENT_CHARGES_SHOWN_AT_FIRST, RENT_MESSAGES, showAllCharges } from "../../constants/rent";
import { RENT_MANAGE_MESSAGES } from "../../constants/rentManage";
import RentChargeRow from "./RentChargeRow";
import RentChargeSheet from "./RentChargeSheet";

interface RentChargesProps {
  applicantId: string;
  canWrite: boolean;
  charges: RentCharge[];
}

export default function RentCharges({ applicantId, canWrite, charges }: RentChargesProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  if (charges.length === 0 && !canWrite) return null;

  const newestFirst = [...charges].reverse();
  const shown = isShowingAll ? newestFirst : newestFirst.slice(0, RENT_CHARGES_SHOWN_AT_FIRST);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
        {RENT_MESSAGES.chargesHeading}
      </Text>
      {shown.map((charge) => (
        <RentChargeRow applicantId={applicantId} canWrite={canWrite} charge={charge} key={charge.id} />
      ))}
      {charges.length > RENT_CHARGES_SHOWN_AT_FIRST ? (
        <LoadingButton onPress={() => setIsShowingAll(!isShowingAll)} variant="ghost">
          {isShowingAll ? RENT_MESSAGES.showFewer : showAllCharges(charges.length)}
        </LoadingButton>
      ) : null}
      {canWrite ? (
        <LoadingButton onPress={() => setIsAdding(true)} variant="secondary">
          {RENT_MANAGE_MESSAGES.addCharge}
        </LoadingButton>
      ) : null}
      {isAdding ? <RentChargeSheet applicantId={applicantId} onClose={() => setIsAdding(false)} /> : null}
    </View>
  );
}
