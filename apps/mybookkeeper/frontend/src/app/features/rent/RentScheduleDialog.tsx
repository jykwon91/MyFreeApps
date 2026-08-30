import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import RentScheduleForm from "./RentScheduleForm";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentScheduleDialogProps {
  applicantId: string;
  existing: RentSchedule | null;
  onClose: () => void;
}

export default function RentScheduleDialog({
  applicantId,
  existing,
  onClose,
}: RentScheduleDialogProps) {
  return (
    <FormDialogShell
      title={existing ? "Edit rent schedule" : "Set up rent"}
      testId="rent-schedule-dialog"
      onClose={onClose}
      width="wide"
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Rent is charged on its own rhythm and settled by whatever payments
          arrive. A tenant billed monthly can pay weekly — each payment is
          applied to the oldest unpaid period, so the balance stays right
          without anyone reconciling by hand.
        </p>
        <RentScheduleForm
          applicantId={applicantId}
          existing={existing}
          onSaved={onClose}
          onCancel={onClose}
        />
      </div>
    </FormDialogShell>
  );
}
