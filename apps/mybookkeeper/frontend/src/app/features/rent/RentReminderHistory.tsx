import { AlertBox } from "@platform/ui";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetRentReminderSendsQuery } from "@/shared/store/rentRemindersApi";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDueDate } from "./rent-reminder-format";
import { describeReminderError, RENT_REMINDER_CHANNEL_LABEL } from "./rent-reminder-labels";
import RentReminderStatusBadge from "./RentReminderStatusBadge";

export interface RentReminderHistoryProps {
  applicantId: string;
}

/** Every reminder sent to this tenant, newest first, with delivery status. */
export default function RentReminderHistory({ applicantId }: RentReminderHistoryProps) {
  const { data: sends, isLoading, isError } = useGetRentReminderSendsQuery(applicantId);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center justify-between gap-2 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !sends) {
    return <AlertBox variant="error">Couldn&apos;t load reminder history.</AlertBox>;
  }

  if (sends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="rent-reminder-history-empty">
        No reminders sent yet.
      </p>
    );
  }

  return (
    <ul className="divide-y" data-testid="rent-reminder-history">
      {sends.map((send) => {
        const reason = send.status === "failed" ? describeReminderError(send.error_code) : null;
        return (
          <li
            key={send.id}
            className="flex items-start justify-between gap-3 py-2"
            data-testid="rent-reminder-history-row"
          >
            <div className="min-w-0">
              <p className="text-sm">
                {RENT_REMINDER_CHANNEL_LABEL[send.channel]} · {formatCurrency(send.amount)} due{" "}
                {formatDueDate(send.due_date)}
              </p>
              {reason ? (
                <p className="text-xs text-muted-foreground break-words">{reason}</p>
              ) : null}
            </div>
            <RentReminderStatusBadge status={send.status} />
          </li>
        );
      })}
    </ul>
  );
}
