import { Plus } from "lucide-react";
import { Button } from "@platform/ui";
import RentBalanceLine from "./RentBalanceLine";
import RentChargeList from "./RentChargeList";
import RentCurrentPeriodCard from "./RentCurrentPeriodCard";
import RentScheduleSummary from "./RentScheduleSummary";
import type { RentCharge } from "@/shared/types/rent/rent-charge";
import type { RentLedgerResponse } from "@/shared/types/rent/rent-ledger-response";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentLedgerBodyProps {
  ledger: RentLedgerResponse;
  applicantId: string;
  canWrite: boolean;
  onEditSchedule: (schedule: RentSchedule) => void;
  onAddCharge: () => void;
  onWaiveCharge: (charge: RentCharge) => void;
}

/**
 * The loaded ledger, top to bottom: what is owed, how this period is going,
 * where the account stands overall, then the evidence for both.
 *
 * The current-period card comes first because it is the answer to the question
 * the panel exists for. It can be absent — a tenancy that has ended has no
 * live period — and the panel says so rather than falling back to a total that
 * would read as if rent were still accruing.
 *
 * There is no payment list here on purpose. Payments are listed once, in the
 * Payments panel, annotated with the periods they settled; a charge row
 * expands to show the same relationship from the other side. Two lists of the
 * same money would only invite the reader to reconcile them.
 */
export default function RentLedgerBody({
  ledger,
  applicantId,
  canWrite,
  onEditSchedule,
  onAddCharge,
  onWaiveCharge,
}: RentLedgerBodyProps) {
  return (
    <div className="space-y-4" data-testid="rent-ledger-body">
      {ledger.schedules.map((schedule) => (
        <RentScheduleSummary
          key={schedule.id}
          schedule={schedule}
          canWrite={canWrite}
          onEdit={onEditSchedule}
        />
      ))}

      {ledger.current_period ? (
        <RentCurrentPeriodCard period={ledger.current_period} />
      ) : (
        <p
          className="text-sm text-muted-foreground"
          data-testid="rent-no-current-period"
        >
          No rent is due right now — the schedule has ended or has not started.
        </p>
      )}

      <RentBalanceLine
        balance={ledger.balance}
        totalCharged={ledger.total_charged}
        totalPaid={ledger.total_paid}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Charges
          </h3>
          {canWrite ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAddCharge}
              data-testid="rent-add-charge-button"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Add charge
            </Button>
          ) : null}
        </div>
        <RentChargeList
          charges={ledger.charges}
          applicantId={applicantId}
          canWrite={canWrite}
          onWaive={onWaiveCharge}
        />
      </div>
    </div>
  );
}
