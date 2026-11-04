import { RENT_REMINDER_CHANNEL_LABEL, RENT_REMINDER_STATUS_LABEL } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import { useGetRentReminderSendsQuery } from "@mybookkeeper/api-client/store/rentRemindersApi";
import { describeReminderError } from "@mybookkeeper/api-client/utils/rentReminderError";
import { LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { REMINDER_MESSAGES, RENT_REMINDERS_SHOWN_AT_FIRST, showAllReminders } from "../../constants/rentReminders";
import InquiryChip from "../inquiries/InquiryChip";
import { dueLine } from "./rentReminderDisplay";

export default function RentReminderHistory({ applicantId }: { applicantId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: sends, isFetching, refetch } = useGetRentReminderSendsQuery(applicantId, { refetchOnFocus: true });
  const [isShowingAll, setIsShowingAll] = useState(false);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const shown = isShowingAll ? sends : sends?.slice(0, RENT_REMINDERS_SHOWN_AT_FIRST);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
        {REMINDER_MESSAGES.history}
      </Text>
      {!sends && isFetching ? (
        <>
          <Skeleton height={20} width="100%" />
          <Skeleton height={20} width="100%" />
        </>
      ) : null}
      {!sends && !isFetching ? (
        <>
          <Text style={mutedText}>{REMINDER_MESSAGES.couldntLoadHistory}</Text>
          <LoadingButton onPress={() => void refetch()} variant="ghost">
            {REMINDER_MESSAGES.tryAgain}
          </LoadingButton>
        </>
      ) : null}
      {sends?.length === 0 ? <Text style={mutedText}>{REMINDER_MESSAGES.noHistory}</Text> : null}
      {shown?.map((send) => (
        <View accessible key={send.id} style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{`${RENT_REMINDER_CHANNEL_LABEL[send.channel]} · ${dueLine(send)}`}</Text>
          <InquiryChip label={RENT_REMINDER_STATUS_LABEL[send.status]} />
          {send.status === "failed" ? <Text style={mutedText}>{describeReminderError(send.error_code)}</Text> : null}
        </View>
      ))}
      {sends && sends.length > RENT_REMINDERS_SHOWN_AT_FIRST ? (
        <LoadingButton onPress={() => setIsShowingAll(!isShowingAll)} variant="ghost">
          {isShowingAll ? REMINDER_MESSAGES.showFewer : showAllReminders(sends.length)}
        </LoadingButton>
      ) : null}
    </View>
  );
}
