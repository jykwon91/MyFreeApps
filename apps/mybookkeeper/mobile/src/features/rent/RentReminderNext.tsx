import { RENT_REMINDER_CHANNEL_LABEL } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import { useGetRentReminderPreviewQuery } from "@mybookkeeper/api-client/store/rentRemindersApi";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import { formatDueDate } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import { Banner, LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { goesBy, REMINDER_MESSAGES, sentFor } from "../../constants/rentReminders";
import { channelWords, dueLine, firstNameOf, planChannels, sendMoment, sendReadiness } from "./rentReminderDisplay";
import RentReminderSendButton from "./RentReminderSendButton";
import { useSendRentReminder } from "./useSendRentReminder";

interface RentReminderNextProps {
  applicantId: string;
  name: string | null;
  overview: RentReminderOverview;
  plan: RentReminderPlan;
  /** Read-only: a viewer, or a tenancy that's over. */
  showSend: boolean;
  isStale: boolean;
}

export default function RentReminderNext({ applicantId, name, overview, plan, showSend, isStale }: RentReminderNextProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { currentData: preview, error, isFetching, refetch } = useGetRentReminderPreviewQuery(applicantId, { refetchOnFocus: true });
  // Held here: the button goes away once a send shows up, and its outcome has to stay on screen.
  const { send, isSending, isHeld, problem, sentDueDate } = useSendRentReminder(applicantId, name);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const outcome = problem ? <Banner message={problem} /> : null;
  const heading = (
    <Text accessibilityRole="header" style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>
      {plan.is_active ? REMINDER_MESSAGES.next : REMINDER_MESSAGES.nextWhenBack}
    </Text>
  );

  if (preview === undefined) {
    return (
      <View style={{ gap: spacing.sm }}>
        {outcome}
        {heading}
        {isFetching ? (
          <>
            <Skeleton height={24} width="60%" />
            <Skeleton height={96} width="100%" />
          </>
        ) : (
          <>
            <Text style={mutedText}>{REMINDER_MESSAGES.couldntLoadNext}</Text>
            <LoadingButton onPress={() => void refetch()} variant="ghost">
              {REMINDER_MESSAGES.tryAgain}
            </LoadingButton>
          </>
        )}
      </View>
    );
  }
  if (preview === null) {
    return (
      <View style={{ gap: spacing.sm }}>
        {outcome}
        <Text style={mutedText}>{REMINDER_MESSAGES.nothingDue}</Text>
      </View>
    );
  }

  const channels = planChannels(plan);
  const alreadySent = preview.sent_channels.length > 0;
  const { canSend, notes } = sendReadiness(overview, plan, firstNameOf(name));

  return (
    <View style={{ gap: spacing.sm }}>
      {outcome}
      {heading}
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{dueLine(preview)}</Text>
      {plan.is_active && !alreadySent ? <Text style={mutedText}>{sendMoment(preview.send_at)}</Text> : null}
      <Text
        selectable
        style={{ fontSize: fontSize.sm, color: colors.foreground, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}
      >
        {preview.message}
      </Text>
      <Text style={mutedText}>{goesBy(channelWords(channels))}</Text>
      <Text style={mutedText}>{REMINDER_MESSAGES.dontCheckPaid}</Text>
      {alreadySent ? (
        <>
          <Text style={mutedText}>{sentFor(formatDueDate(preview.due_date), preview.sent_channels.map((channel) => RENT_REMINDER_CHANNEL_LABEL[channel]).join(", "))}</Text>
          <Text style={mutedText}>{REMINDER_MESSAGES.cantSendAgain}</Text>
        </>
      ) : null}
      {showSend && !alreadySent && !plan.is_active ? <Text style={mutedText}>{REMINDER_MESSAGES.pausedCantSend}</Text> : null}
      {showSend && !alreadySent && plan.is_active ? (
        <RentReminderSendButton
          canSend={canSend && !isStale && !error && !isFetching && !isHeld && sentDueDate !== preview.due_date}
          channels={channels}
          isSending={isSending}
          name={name}
          onConfirmed={() => void send(preview, channels)}
          notes={notes}
          preview={preview}
        />
      ) : null}
    </View>
  );
}
