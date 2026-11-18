import type { ReactNode } from "react";
import type { RentalRoiCostLine } from "@mybookkeeper/api-client/types/analytics/rental-roi-cost-line";
import { formatExactMoneyCents } from "@mybookkeeper/api-client/utils/rentalRoi";
import RentalRoiCostLineRow from "./RentalRoiCostLineRow";

export interface RentalRoiCostSectionProps {
  title: string;
  /** Left out for lines that aren't part of the total. */
  subtotalCents?: number;
  lines: RentalRoiCostLine[];
  months: number;
  note: ReactNode;
}

export default function RentalRoiCostSection({ title, subtotalCents, lines, months, note }: RentalRoiCostSectionProps) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtotalCents !== undefined && (
          <p className="shrink-0 text-sm font-semibold tabular-nums">{formatExactMoneyCents(subtotalCents)}/mo</p>
        )}
      </div>
      {lines.length > 0 && <ul className="divide-y divide-border/50">{lines.map((line) => (
        <RentalRoiCostLineRow key={line.category} line={line} months={months} />
      ))}</ul>}
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </section>
  );
}
