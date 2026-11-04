import { RENT_CADENCE_LABEL } from "@mybookkeeper/api-client/constants/rentLabels";
import type { RentSchedule } from "@mybookkeeper/api-client/types/rent/rent-schedule";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { formatCurrency } from "@platform/core/utils/currency";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function RentScheduleLine({ schedule }: { schedule: RentSchedule }) {
  const { colors, spacing, fontSize } = useTheme();
  const end = schedule.end_date ? ` to ${formatLongDate(schedule.end_date)}` : "";
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
        {`${formatCurrency(schedule.amount)} ${RENT_CADENCE_LABEL[schedule.cadence]} from ${formatLongDate(schedule.start_date)}${end}`}
      </Text>
      {schedule.notes ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{schedule.notes}</Text> : null}
    </View>
  );
}
