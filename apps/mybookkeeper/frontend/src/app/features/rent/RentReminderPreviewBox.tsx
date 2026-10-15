import { AlertBox, LoadingButton } from "@platform/ui";
import Skeleton from "@/shared/components/ui/Skeleton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useGetRentReminderPreviewQuery,
  useSendRentReminderNowMutation,
} from "@/shared/store/rentRemindersApi";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDueDate, formatSendMoment } from "./rent-reminder-format";
import { RENT_REMINDER_CHANNEL_LABEL } from "./rent-reminder-labels";
import type { RentReminderChannel } from "@/shared/types/rent/rent-reminder-channel";
import type { RentReminderPlan } from "@/shared/types/rent/rent-reminder-plan";

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

/**
 * The next reminder exactly as the tenant will read it, when it goes out, and
 * a Send-now button per channel for when the host would rather not wait.
 */
export default function RentReminderPreviewBox({
  applicantId,
  plan,
  canWrite,
}: RentReminderPreviewBoxProps) {
  const { data: preview, isLoading, isError } = useGetRentReminderPreviewQuery(applicantId);
  const [sendNow, { isLoading: isSending, originalArgs }] = useSendRentReminderNowMutation();

  async function handleSend(channel: RentReminderChannel) {
    try {
      const result = await sendNow({ applicantId, channel }).unwrap();
      if (result.status === "failed") {
        showError(`The ${RENT_REMINDER_CHANNEL_LABEL[channel].toLowerCase()} didn't go out — see history below.`);
      } else if (channel === "sms") {
        showSuccess("Text handed to your phone.");
      } else {
        showSuccess("Reminder email sent.");
      }
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 space-y-3 bg-card" aria-busy="true">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }

  if (isError) {
    return <AlertBox variant="error">Couldn&apos;t load the next reminder.</AlertBox>;
  }

  if (!preview) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rent-reminder-preview-none">
        No upcoming rent to remind about. Set up or extend the rent schedule above.
      </p>
    );
  }

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

      {canWrite ? (
        <div className="flex flex-col sm:flex-row gap-2">
          {enabledChannels(plan).map((channel) => {
            const alreadySent = preview.sent_channels.includes(channel);
            const isThisOne = isSending && originalArgs?.channel === channel;
            return (
              <LoadingButton
                key={channel}
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isThisOne}
                loadingText="Sending..."
                disabled={isSending || alreadySent}
                onClick={() => void handleSend(channel)}
                className="min-h-[44px]"
                data-testid={`rent-reminder-send-now-${channel}`}
              >
                {alreadySent
                  ? `${RENT_REMINDER_CHANNEL_LABEL[channel]} sent`
                  : `Send ${RENT_REMINDER_CHANNEL_LABEL[channel].toLowerCase()} now`}
              </LoadingButton>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
