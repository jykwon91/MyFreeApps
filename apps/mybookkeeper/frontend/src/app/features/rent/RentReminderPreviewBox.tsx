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
import type { RentReminderSend } from "@/shared/types/rent/rent-reminder-send";

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
  const failed = results.filter((r) => r.status === "failed").map((r) => r.channel);
  if (failed.length > 0) {
    showError(`The ${channelList(failed)} didn't go out — see history below.`);
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

  async function handleSend() {
    try {
      reportResults(await sendNow({ applicantId }).unwrap());
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

  const channels = enabledChannels(plan);
  const alreadySent = preview.sent_channels.length > 0;

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

      {canWrite && channels.length > 0 ? (
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isSending}
          loadingText="Sending..."
          disabled={isSending || alreadySent}
          onClick={() => void handleSend()}
          className="min-h-[44px] w-full sm:w-auto"
          data-testid="rent-reminder-send-now"
        >
          {alreadySent ? "Sent for this due date" : `Send ${channelList(channels)} now`}
        </LoadingButton>
      ) : null}
    </div>
  );
}
