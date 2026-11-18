import type { RentalRoiCostLine } from "@mybookkeeper/api-client/types/analytics/rental-roi-cost-line";
import {
  describeCostLineAverage,
  formatExactMoneyCents,
  rentalRoiCostLineLabel,
} from "@mybookkeeper/api-client/utils/rentalRoi";

export interface RentalRoiCostLineRowProps {
  line: RentalRoiCostLine;
  months: number;
}

export default function RentalRoiCostLineRow({ line, months }: RentalRoiCostLineRowProps) {
  return (
    <li className="flex items-start justify-between gap-4 py-2" data-testid="rental-roi-cost-line">
      <div className="min-w-0">
        <p className="text-sm">{rentalRoiCostLineLabel(line.category)}</p>
        {line.window_total_cents !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {describeCostLineAverage(line.window_total_cents, months)}
          </p>
        )}
      </div>
      <p className="shrink-0 text-sm font-medium tabular-nums">{formatExactMoneyCents(line.monthly_cents)}/mo</p>
    </li>
  );
}
