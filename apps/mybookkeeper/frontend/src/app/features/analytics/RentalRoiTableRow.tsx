import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import RentalRoiDetails from "./RentalRoiDetails";
import RentalRoiDetailsToggle from "./RentalRoiDetailsToggle";
import RentalRoiGap from "./RentalRoiGap";
import RentalRoiPropertyNotes from "./RentalRoiPropertyNotes";
import RentalRoiTargetCell from "./RentalRoiTargetCell";

export interface RentalRoiTableRowProps {
  property: RentalRoiProperty;
  onShowBreakEven: (propertyId: string) => void;
}

export default function RentalRoiTableRow({ property, onShowBreakEven }: RentalRoiTableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <>
      <tr className="border-b align-top" data-testid="rental-roi-row">
        <th scope="row" className="py-3 pr-4 text-left font-medium">
          <div className="flex flex-col gap-1">
            <span>{property.property_name}</span>
            <RentalRoiPropertyNotes property={property} />
            <RentalRoiDetailsToggle
              expanded={expanded}
              controls={detailsId}
              propertyName={property.property_name}
              onToggle={() => setExpanded((v) => !v)}
            />
          </div>
        </th>
        <td className="py-3 px-4 text-right tabular-nums">
          <button
            type="button"
            onClick={() => onShowBreakEven(property.property_id)}
            aria-label={`See how the ${property.property_name} break-even of ${formatMoneyCents(property.break_even_monthly_cents)} is calculated`}
            className="-my-3 inline-flex min-h-[44px] items-center gap-0.5 font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {formatMoneyCents(property.break_even_monthly_cents)}
            <ChevronRight size={14} aria-hidden />
          </button>
        </td>
        <td className="py-3 px-4 text-right tabular-nums">
          <RentalRoiTargetCell property={property} />
        </td>
        <td className="py-3 px-4 text-right tabular-nums">{formatMoneyCents(property.actual_revenue_monthly_cents)}</td>
        <td className="py-3 pl-4 text-right tabular-nums">
          <RentalRoiGap cents={property.gap_monthly_cents} basis={property.gap_basis} className="items-end" />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="py-3 px-4">
            <RentalRoiDetails property={property} id={detailsId} />
          </td>
        </tr>
      )}
    </>
  );
}
