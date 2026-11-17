import { Link } from "react-router-dom";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { propertyEditPath } from "@/shared/lib/property-routes";

export interface RentalRoiTargetCellProps {
  property: RentalRoiProperty;
}

/** The monthly target, or the way to get one: it needs the purchase price. */
export default function RentalRoiTargetCell({ property }: RentalRoiTargetCellProps) {
  if (property.target_monthly_cents !== null) {
    return <>{formatMoneyCents(property.target_monthly_cents)}</>;
  }
  if (!property.has_purchase_price) {
    return (
      <Link
        to={propertyEditPath(property.property_id)}
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
      >
        Add purchase price
      </Link>
    );
  }
  // A price but no target: the loans' original amounts are missing, or cover the whole price.
  return (
    <span>
      <span aria-hidden>—</span>
      <span className="sr-only">Not available</span>
    </span>
  );
}
