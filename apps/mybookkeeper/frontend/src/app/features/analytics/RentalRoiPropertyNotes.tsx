import { Link } from "react-router-dom";
import { RENTAL_ROI_FEW_MONTHS } from "@mybookkeeper/api-client/constants/rentalRoi";
import { RENTAL_ROI_BREAKDOWN_MESSAGES } from "@mybookkeeper/api-client/constants/rentalRoiBreakdown";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import Badge from "@/shared/components/ui/Badge";

export interface RentalRoiPropertyNotesProps {
  property: RentalRoiProperty;
}

/** What the figures for one property are missing or estimated from. */
export default function RentalRoiPropertyNotes({ property }: RentalRoiPropertyNotesProps) {
  const fewMonths = property.months_averaged < RENTAL_ROI_FEW_MONTHS;
  if (property.mortgage_source === "records" && !fewMonths && !property.is_personal_home) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {fewMonths && <Badge color="yellow" label={`Based on ${property.months_averaged} month${property.months_averaged === 1 ? "" : "s"}`} />}
      {property.is_personal_home && <span>{RENTAL_ROI_BREAKDOWN_MESSAGES.personalHomeNote}</span>}
      {property.mortgage_source === "transactions" && <span>Mortgage estimated from transactions</span>}
      {property.mortgage_source === "none" && (
        <span>
          No mortgage found — costs exclude it.{" "}
          <Link to="/mortgages" className="font-medium text-primary hover:underline">
            Add mortgage
          </Link>
        </span>
      )}
    </div>
  );
}
