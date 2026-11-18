import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import Card from "@/shared/components/ui/Card";
import RentalRoiGap from "./RentalRoiGap";
import RentalRoiTableRow from "./RentalRoiTableRow";
import RentalRoiTotalTarget from "./RentalRoiTotalTarget";

export interface RentalRoiTableProps {
  properties: RentalRoiProperty[];
  summary: RentalRoiSummary;
  onShowBreakEven: (propertyId: string) => void;
}

export default function RentalRoiTable({ properties, summary, onShowBreakEven }: RentalRoiTableProps) {
  return (
    <Card className="hidden md:block p-0 overflow-x-auto">
      <table className="w-full text-sm" aria-label="Monthly numbers by property">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-3 pl-6 pr-4 text-left font-medium">Property</th>
            <th scope="col" className="py-3 px-4 text-right font-medium">Break-even</th>
            <th scope="col" className="py-3 px-4 text-right font-medium">Target</th>
            <th scope="col" className="py-3 px-4 text-right font-medium">Actual</th>
            <th scope="col" className="py-3 pl-4 pr-6 text-right font-medium">Gap</th>
          </tr>
        </thead>
        <tbody className="[&_th]:pl-6 [&_td:last-child]:pr-6">
          {properties.map((property) => (
            <RentalRoiTableRow key={property.property_id} property={property} onShowBreakEven={onShowBreakEven} />
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold align-top" data-testid="rental-roi-total-row">
            <th scope="row" className="py-3 pl-6 pr-4 text-left">Total</th>
            <td className="py-3 px-4 text-right tabular-nums">{formatMoneyCents(summary.total_break_even_monthly_cents)}</td>
            <td className="py-3 px-4 text-right tabular-nums">
              <RentalRoiTotalTarget summary={summary} />
            </td>
            <td className="py-3 px-4 text-right tabular-nums">{formatMoneyCents(summary.total_actual_revenue_monthly_cents)}</td>
            <td className="py-3 pl-4 pr-6 text-right tabular-nums">
              <RentalRoiGap cents={summary.total_gap_monthly_cents} basis={summary.gap_basis} className="items-end" />
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
