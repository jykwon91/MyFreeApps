import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import RentChargeStatusBadge from "./RentChargeStatusBadge";
import RentChargeApplications from "./RentChargeApplications";
import RentChargeRowActions from "./RentChargeRowActions";
import { RENT_CHARGE_TYPE_LABEL } from "./rent-labels";
import { proratedNote } from "./rent-prorated-note";
import type { RentCharge } from "@/shared/types/rent/rent-charge";

export interface RentChargeRowProps {
  charge: RentCharge;
  applicantId: string;
  canWrite: boolean;
  onWaive: (charge: RentCharge) => void;
}

/** A charge's own title. Rent periods carry their dates in the meta line, so
 *  repeating "Rent" there would be noise; anything else needs naming. */
function titleFor(charge: RentCharge): string {
  if (charge.description) return charge.description;
  if (charge.charge_type === "rent") {
    return `${formatShortDate(charge.period_start)} – ${formatShortDate(charge.period_end)}`;
  }
  return RENT_CHARGE_TYPE_LABEL[charge.charge_type];
}

export default function RentChargeRow({
  charge,
  applicantId,
  canWrite,
  onWaive,
}: RentChargeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const prorated = proratedNote(charge.full_amount);

  return (
    <li className="py-2" data-testid="rent-charge-row">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left min-h-[44px] rounded hover:bg-muted/50 px-1 -mx-1"
          data-testid="rent-charge-toggle"
        >
          <Chevron
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="flex-1 min-w-0">
            <span className="block truncate text-sm">{titleFor(charge)}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {formatCurrency(charge.allocated)} of{" "}
              {formatCurrency(charge.amount)}
            </span>
          </span>
          <RentChargeStatusBadge status={charge.status} />
        </button>
        {canWrite ? (
          <RentChargeRowActions
            charge={charge}
            applicantId={applicantId}
            onWaive={onWaive}
          />
        ) : null}
      </div>

      {prorated ? (
        <p
          className="text-xs text-muted-foreground pl-7 pt-1"
          data-testid="rent-charge-prorated"
        >
          {prorated}
        </p>
      ) : null}

      {charge.waived_at && charge.waived_reason ? (
        <p className="text-xs text-muted-foreground italic pl-7 pt-1">
          Waived — {charge.waived_reason}
        </p>
      ) : null}

      {expanded ? (
        <div className="pl-7 pt-2">
          <RentChargeApplications applications={charge.applications} />
        </div>
      ) : null}
    </li>
  );
}
