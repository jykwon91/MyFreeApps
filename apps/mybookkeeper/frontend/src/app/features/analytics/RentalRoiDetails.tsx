import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { formatRatioPct } from "@mybookkeeper/api-client/utils/rentalRoi";

export interface RentalRoiDetailsProps {
  property: RentalRoiProperty;
  id: string;
}

export default function RentalRoiDetails({ property, id }: RentalRoiDetailsProps) {
  const { cost_breakdown: costs } = property;
  return (
    <dl id={id} className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Mortgage payment</dt>
        <dd className="font-medium">{formatMoneyCents(costs.debt_service_monthly_cents)}/mo</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Operating costs</dt>
        <dd className="font-medium">{formatMoneyCents(costs.operating_monthly_cents)}/mo</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Cash-on-cash return</dt>
        <dd className="font-medium">{formatRatioPct(property.cash_on_cash_pct)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Cap rate</dt>
        <dd className="font-medium">{formatRatioPct(property.cap_rate_pct)}</dd>
      </div>
      <p className="col-span-2 sm:col-span-4 text-xs text-muted-foreground">
        Average of {property.months_averaged} month{property.months_averaged === 1 ? "" : "s"}
      </p>
    </dl>
  );
}
