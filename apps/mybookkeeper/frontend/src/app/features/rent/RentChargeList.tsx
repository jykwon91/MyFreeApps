import RentChargeRow from "./RentChargeRow";
import type { RentCharge } from "@/shared/types/rent/rent-charge";

export interface RentChargeListProps {
  charges: readonly RentCharge[];
  applicantId: string;
  canWrite: boolean;
  onWaive: (charge: RentCharge) => void;
}

/** Charges newest first — the period a host is asking about is almost always
 *  the current one, and a chronological list would bury it under a year of
 *  settled history. */
export default function RentChargeList({
  charges,
  applicantId,
  canWrite,
  onWaive,
}: RentChargeListProps) {
  if (charges.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No charges yet — the first one appears when the schedule's first period
        begins.
      </p>
    );
  }

  const newestFirst = [...charges].reverse();

  return (
    <ul className="divide-y" data-testid="rent-charge-list">
      {newestFirst.map((charge) => (
        <RentChargeRow
          key={charge.id}
          charge={charge}
          applicantId={applicantId}
          canWrite={canWrite}
          onWaive={onWaive}
        />
      ))}
    </ul>
  );
}
