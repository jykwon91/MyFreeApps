import { RENT_CHARGE_STATUS_LABEL } from "@mybookkeeper/api-client/constants/rentLabels";
import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import { proratedNote } from "@mybookkeeper/api-client/utils/rentProratedNote";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RENT_MESSAGES, waivedBecause } from "../../constants/rent";
import RentChargeActions from "./RentChargeActions";
import RentChargeApplication from "./RentChargeApplication";
import { chargeAmountText, chargeSpokenLabel, chargeTitle } from "./rentDisplay";
import RentWaiveSheet from "./RentWaiveSheet";

export default function RentChargeRow({ applicantId, canWrite, charge }: { applicantId: string; canWrite: boolean; charge: RentCharge }) {
  const { colors, spacing, fontSize } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isWaiving, setIsWaiving] = useState(false);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const note = proratedNote(charge.full_amount);

  return (
    <View>
      <Pressable
        accessibilityHint={RENT_MESSAGES.chargeHint}
        accessibilityLabel={chargeSpokenLabel(charge)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded(!isExpanded)}
        style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.muted : undefined })}
      >
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{chargeTitle(charge)}</Text>
          <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: colors.foreground }}>
            {chargeAmountText(charge)}
          </Text>
        </View>
        <Chip label={RENT_CHARGE_STATUS_LABEL[charge.status]} />
        {note ? <Text style={mutedText}>{note}</Text> : null}
        {charge.waived_at && charge.waived_reason ? <Text style={mutedText}>{waivedBecause(charge.waived_reason)}</Text> : null}
      </Pressable>
      {isExpanded ? (
        <View style={{ gap: spacing.xs, paddingLeft: spacing.md, paddingBottom: spacing.sm }}>
          {charge.applications.length === 0 ? <Text style={mutedText}>{charge.status === "waived" ? RENT_MESSAGES.waivedNothingApplied : RENT_MESSAGES.nothingApplied}</Text> : null}
          {charge.applications.map((application) => (
            <RentChargeApplication application={application} key={`${application.transaction_id}-${application.paid_on}`} />
          ))}
          {canWrite ? <RentChargeActions applicantId={applicantId} charge={charge} onWaive={() => setIsWaiving(true)} /> : null}
        </View>
      ) : null}
      {isWaiving ? <RentWaiveSheet applicantId={applicantId} charge={charge} onClose={() => setIsWaiving(false)} /> : null}
    </View>
  );
}
