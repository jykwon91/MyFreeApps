import { useState } from "react";
import { AlertBox, Button } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useGetRentLedgerQuery } from "@/shared/store/rentLedgerApi";
import RentChargeDialog from "./RentChargeDialog";
import RentLedgerBody from "./RentLedgerBody";
import RentLedgerEmpty from "./RentLedgerEmpty";
import RentLedgerSkeleton from "./RentLedgerSkeleton";
import RentScheduleDialog from "./RentScheduleDialog";
import RentWaiveDialog from "./RentWaiveDialog";
import type { RentCharge } from "@/shared/types/rent/rent-charge";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentLedgerPanelProps {
  applicantId: string;
}

/** Which dialog, if any, is open. A single value rather than three booleans so
 *  two dialogs can never be stacked on top of each other. */
type OpenDialog =
  | { kind: "none" }
  | { kind: "schedule"; schedule: RentSchedule | null }
  | { kind: "charge" }
  | { kind: "waive"; charge: RentCharge };

const CLOSED: OpenDialog = { kind: "none" };

/**
 * Rent for one tenant: what is owed, what has arrived, and how the two line up.
 *
 * The ledger is derived on read — charges for elapsed periods are materialised
 * on demand and payments are allocated to them oldest-first every time — so
 * there is nothing to refresh or reconcile. Opening the panel is what keeps it
 * current.
 */
export default function RentLedgerPanel({ applicantId }: RentLedgerPanelProps) {
  const canWrite = useCanWrite();
  const [dialog, setDialog] = useState<OpenDialog>(CLOSED);
  const { data: ledger, isLoading, isError, refetch } = useGetRentLedgerQuery({
    applicantId,
  });

  if (isLoading) return <RentLedgerSkeleton />;

  if (isError || !ledger) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>Couldn&apos;t load the rent ledger.</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          data-testid="rent-ledger-retry"
        >
          Retry
        </Button>
      </AlertBox>
    );
  }

  const close = () => setDialog(CLOSED);

  return (
    <>
      {ledger.schedules.length === 0 ? (
        <RentLedgerEmpty
          canWrite={canWrite}
          onSetUp={() => setDialog({ kind: "schedule", schedule: null })}
        />
      ) : (
        <RentLedgerBody
          ledger={ledger}
          applicantId={applicantId}
          canWrite={canWrite}
          onEditSchedule={(schedule) => setDialog({ kind: "schedule", schedule })}
          onAddCharge={() => setDialog({ kind: "charge" })}
          onWaiveCharge={(charge) => setDialog({ kind: "waive", charge })}
        />
      )}

      {dialog.kind === "schedule" ? (
        <RentScheduleDialog
          applicantId={applicantId}
          existing={dialog.schedule}
          onClose={close}
        />
      ) : null}

      {dialog.kind === "charge" ? (
        <RentChargeDialog applicantId={applicantId} onClose={close} />
      ) : null}

      {dialog.kind === "waive" ? (
        <RentWaiveDialog
          charge={dialog.charge}
          applicantId={applicantId}
          onClose={close}
        />
      ) : null}
    </>
  );
}
