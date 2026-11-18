import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import RentalRoiPropertyCard from "./RentalRoiPropertyCard";
import RentalRoiTotalCard from "./RentalRoiTotalCard";

export interface RentalRoiCardsProps {
  properties: RentalRoiProperty[];
  summary: RentalRoiSummary;
  onShowBreakEven: (propertyId: string) => void;
}

export default function RentalRoiCards({ properties, summary, onShowBreakEven }: RentalRoiCardsProps) {
  return (
    <div className="space-y-3 md:hidden" data-testid="rental-roi-cards">
      <RentalRoiTotalCard summary={summary} />
      {properties.map((property) => (
        <RentalRoiPropertyCard key={property.property_id} property={property} onShowBreakEven={onShowBreakEven} />
      ))}
    </div>
  );
}
