import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
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
  onShowBreakEven: (propertyId: string) => void;
}

/** Phone layout: the number to hit is the big one; actual and gap sit under it. */
export default function RentalRoiPropertyCard({ property, onShowBreakEven }: RentalRoiPropertyCardProps) {
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
        <button
          type="button"
          onClick={() => onShowBreakEven(property.property_id)}
          aria-label={`See how the ${property.property_name} break-even of ${formatMoneyCents(property.break_even_monthly_cents)} is calculated`}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 text-sm font-medium text-primary"
        >
          How is break-even calculated?
          <ChevronRight size={16} aria-hidden />
        </button>
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
