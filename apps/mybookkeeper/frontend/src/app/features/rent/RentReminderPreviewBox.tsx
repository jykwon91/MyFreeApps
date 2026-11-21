import { useId, useState } from "react";
import { AlertBox, extractErrorMessage, LoadingButton, LoadingRegion, showError, showSuccess, Skeleton } from "@platform/ui";
import {
  useGetRentReminderPreviewQuery,
  useSendRentReminderNowMutation,
} from "@mybookkeeper/api-client/store/rentRemindersApi";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDueDate, formatSendMoment } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import { RENT_REMINDER_CHANNEL_LABEL } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import { mayHaveBeenSentRefusalMessage } from "@mybookkeeper/api-client/utils/mayHaveBeenSentRefusalMessage";
import { reminderMayStillArrive } from "@mybookkeeper/api-client/utils/reminderMayStillArrive";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import RentReminderPossiblySentWarning from "./RentReminderPossiblySentWarning";
import { possiblySentAdvice, possiblySentKey } from "./rent-reminder-possibly-sent";

export interface RentReminderPreviewBoxProps {
  applicantId: string;
  plan: RentReminderPlan;
  canWrite: boolean;
}

function enabledChannels(plan: RentReminderPlan): RentReminderChannel[] {
  const channels: RentReminderChannel[] = [];
  if (plan.email_enabled) channels.push("email");
  if (plan.sms_enabled) channels.push("sms");
  return channels;
}

function channelList(channels: RentReminderChannel[]): string {
  return channels.map((c) => RENT_REMINDER_CHANNEL_LABEL[c].toLowerCase()).join(" and ");
}

function reportResults(results: RentReminderSend[]) {
  const failed = results.filter((r) => r.status === "failed");
  const notSent = failed.filter((r) => !reminderMayStillArrive(r.error_code)).map((r) => r.channel);
  const unsure = failed.filter((r) => reminderMayStillArrive(r.error_code)).map((r) => r.channel);
  const problems = [
    ...(notSent.length > 0 ? [`The ${channelList(notSent)} didn't go out.`] : []),
    ...(unsure.length > 0
      ? [`The ${channelList(unsure)} may already have been sent. ${possiblySentAdvice(unsure)}`]
      : []),
  ];
  if (problems.length > 0) {
    showError(`${problems.join(" ")} See history below.`);
    return;
  }
  showSuccess(`Reminder sent by ${channelList(results.map((r) => r.channel))}.`);
}

/**
 * The next reminder exactly as the tenant will read it, when it goes out, and
 * one Send-now button that sends every enabled channel together — email and
 * text never go out at different times.
 */
export default function RentReminderPreviewBox({
  applicantId,
  plan,
  canWrite,
}: RentReminderPreviewBoxProps) {
  const { data: preview, isLoading, isError } = useGetRentReminderPreviewQuery(applicantId);
  const [sendNow, { isLoading: isSending }] = useSendRentReminderNowMutation();
  // The confirmation holds only for the reminder and tries it was given for:
  // a new due date or a newer try clears it.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const warningId = useId();

  async function handleSend(shown: RentReminderPreview) {
    const confirmed = confirmedFor === possiblySentKey(shown) ? shown.possibly_sent : [];
    setConfirmedFor(null);
    try {
      reportResults(
        await sendNow({
          applicantId,
          due_date: shown.due_date,
          amount: shown.amount,
          message: shown.send_now_message,
          channels: enabledChannels(plan),
          confirmed_possibly_sent: confirmed,
        }).unwrap(),
      );
    } catch (error) {
      showError(mayHaveBeenSentRefusalMessage(error) || extractErrorMessage(error));
    }
  }

  if (isLoading) {
    return (
      <LoadingRegion label="Loading rent reminder preview…" className="rounded-lg border p-4 space-y-3 bg-card">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-9 w-32" />
      </LoadingRegion>
    );
  }

  if (isError) {
    return <AlertBox variant="error" role="alert">Couldn&apos;t load the next reminder.</AlertBox>;
  }

  if (!preview) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rent-reminder-preview-none">
        No upcoming rent to remind about. Set up or extend the rent schedule above.
      </p>
    );
  }

  const channels = enabledChannels(plan);
  const alreadySent = preview.sent_channels.length > 0;
  const possiblySentChannels = preview.possibly_sent.map((p) => p.channel);
  const possiblySent = !alreadySent && possiblySentChannels.length > 0;
  const confirmedResend = confirmedFor === possiblySentKey(preview);

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card" data-testid="rent-reminder-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Next: {formatCurrency(preview.amount)} due {formatDueDate(preview.due_date)}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="rent-reminder-send-at">
          {plan.is_active
            ? `Sends ${formatSendMoment(preview.send_at, plan.timezone)}`
            : "Reminders are paused"}
        </p>
      </div>

      <blockquote
        className="text-sm border-l-2 pl-3 whitespace-pre-wrap break-words"
        data-testid="rent-reminder-message"
      >
        {preview.message}
      </blockquote>

      {canWrite && !alreadySent && preview.send_now_message !== preview.message ? (
        <p className="text-xs text-muted-foreground" data-testid="rent-reminder-send-now-message">
          If you send it now, it will read: {preview.send_now_message}
        </p>
      ) : null}

      {canWrite && channels.length > 0 && possiblySent ? (
        <RentReminderPossiblySentWarning
          id={warningId}
          channels={possiblySentChannels}
          channelWords={channelList(possiblySentChannels)}
          confirmed={confirmedResend}
          onConfirmedChange={(checked) => setConfirmedFor(checked ? possiblySentKey(preview) : null)}
        />
      ) : null}

      {canWrite && channels.length > 0 ? (
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isSending}
          loadingText="Sending..."
          disabled={isSending || alreadySent || (possiblySent && !confirmedResend)}
          aria-describedby={canWrite && possiblySent ? warningId : undefined}
          onClick={() => void handleSend(preview)}
          className="min-h-[44px] w-full sm:w-auto"
          data-testid="rent-reminder-send-now"
        >
          {alreadySent ? "Sent for this due date" : `Send ${channelList(channels)} now`}
        </LoadingButton>
      ) : null}
    </div>
  );
}
