import { useId, useState } from "react";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import Card from "@/shared/components/ui/Card";
import RentalRoiDetails from "./RentalRoiDetails";
import RentalRoiDetailsToggle from "./RentalRoiDetailsToggle";
import RentalRoiGap from "./RentalRoiGap";
import RentalRoiPropertyNotes from "./RentalRoiPropertyNotes";
import RentalRoiTargetCell from "./RentalRoiTargetCell";

export interface RentalRoiPropertyCardProps {
  property: RentalRoiProperty;
}

/** Phone layout: the number to hit is the big one; actual and gap sit under it. */
export default function RentalRoiPropertyCard({ property }: RentalRoiPropertyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const hasTarget = property.target_monthly_cents !== null;
  const headlineCents = property.target_monthly_cents ?? property.break_even_monthly_cents;
  return (
    <Card className="p-4 space-y-3">
      <article aria-label={property.property_name} data-testid="rental-roi-card" className="space-y-3">
        <h3 className="font-medium">{property.property_name}</h3>
        <div>
          <p className="text-xs text-muted-foreground">{hasTarget ? "Target" : "Break-even"}</p>
          <p className="text-2xl font-semibold tabular-nums">{formatMoneyCents(headlineCents)}/mo</p>
          {!hasTarget && (
            <div className="text-sm">
              <RentalRoiTargetCell property={property} />
            </div>
          )}
        </div>
        <div className="flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Actual</p>
            <p className="font-medium tabular-nums">{formatMoneyCents(property.actual_revenue_monthly_cents)}/mo</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Gap</p>
            <RentalRoiGap cents={property.gap_monthly_cents} basis={property.gap_basis} className="items-end" />
          </div>
        </div>
        <RentalRoiPropertyNotes property={property} />
        <RentalRoiDetailsToggle
          expanded={expanded}
          controls={detailsId}
          propertyName={property.property_name}
          onToggle={() => setExpanded((v) => !v)}
        />
        {expanded && <RentalRoiDetails property={property} id={detailsId} />}
      </article>
    </Card>
  );
}
