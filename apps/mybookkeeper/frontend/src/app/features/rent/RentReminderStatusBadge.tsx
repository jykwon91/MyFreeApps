import { StatusBadge } from "@platform/ui";
import {
  RENT_REMINDER_STATUS_LABEL,
  RENT_REMINDER_STATUS_TONE,
} from "./rent-reminder-labels";
import type { RentReminderSendStatus } from "@/shared/types/rent/rent-reminder-send-status";

export interface RentReminderStatusBadgeProps {
  status: RentReminderSendStatus;
  "data-testid"?: string;
}

export default function RentReminderStatusBadge({
  status,
  "data-testid": testId,
}: RentReminderStatusBadgeProps) {
  return (
    <StatusBadge
      tone={RENT_REMINDER_STATUS_TONE[status]}
      label={RENT_REMINDER_STATUS_LABEL[status]}
      data-testid={testId}
    />
  );
}
