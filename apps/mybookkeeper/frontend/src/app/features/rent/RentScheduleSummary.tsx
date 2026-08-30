import { Pencil } from "lucide-react";
import { Button } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";
import { RENT_CADENCE_LABEL } from "./rent-labels";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentScheduleSummaryProps {
  schedule: RentSchedule;
  canWrite: boolean;
  onEdit: (schedule: RentSchedule) => void;
}

/**
 * One line of "what is owed and how often", plus the way to change it.
 *
 * The amount and cadence are shown as plain text with no edit affordance
 * because neither can be edited: changing them would silently restate what was
 * owed for periods that have already been settled. The edit dialog can end the
 * schedule, adjust the grace window, or annotate it — a rent change is a new
 * schedule.
 */
export default function RentScheduleSummary({
  schedule,
  canWrite,
  onEdit,
}: RentScheduleSummaryProps) {
  return (
    <div
      className="flex items-start justify-between gap-3 flex-wrap"
      data-testid="rent-schedule-summary"
    >
      <div className="text-sm">
        <span className="font-medium tabular-nums">
          {formatCurrency(schedule.amount)}
        </span>{" "}
        <span className="text-muted-foreground">
          {RENT_CADENCE_LABEL[schedule.cadence]} from{" "}
          {formatLongDate(schedule.start_date)}
          {schedule.end_date ? ` to ${formatLongDate(schedule.end_date)}` : ""}
        </span>
        {schedule.notes ? (
          <p className="text-xs text-muted-foreground mt-0.5">{schedule.notes}</p>
        ) : null}
      </div>
      {canWrite ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onEdit(schedule)}
          data-testid="rent-edit-schedule-button"
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Edit
        </Button>
      ) : null}
    </div>
  );
}
