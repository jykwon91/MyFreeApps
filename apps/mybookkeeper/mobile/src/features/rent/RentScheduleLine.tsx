import { RENT_CADENCE_LABEL } from "@mybookkeeper/api-client/constants/rentLabels";
import type { RentSchedule } from "@mybookkeeper/api-client/types/rent/rent-schedule";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RENT_MANAGE_MESSAGES } from "../../constants/rentManage";

interface RentScheduleLineProps {
  schedule: RentSchedule;
  /** Present for someone who can change it. */
  onEdit?: () => void;
}

export default function RentScheduleLine({ schedule, onEdit }: RentScheduleLineProps) {
  const { colors, spacing, fontSize } = useTheme();
  const end = schedule.end_date ? ` to ${formatLongDate(schedule.end_date)}` : "";
  const summary = `${formatCurrency(schedule.amount)} ${RENT_CADENCE_LABEL[schedule.cadence]} from ${formatLongDate(schedule.start_date)}${end}`;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{summary}</Text>
      {schedule.notes ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{schedule.notes}</Text> : null}
      {onEdit ? (
        <LoadingButton accessibilityLabel={`${RENT_MANAGE_MESSAGES.editSchedule}, ${summary}`} onPress={onEdit} variant="ghost">
          {RENT_MANAGE_MESSAGES.editSchedule}
        </LoadingButton>
      ) : null}
    </View>
  );
}
