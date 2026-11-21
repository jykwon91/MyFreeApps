import { formatCost, formatPrice } from "@/games/wow-forever/crafting/matPrices";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

function part(label: string, copper: number | null): string {
  return `${label} ${copper === null ? "no price" : formatCost(copper)}`;
}

/** A phone card's "Crate X + Bundle Y − Refund Z" line; the wide grid has a column for each. */
export default function CratePriceBreakdown({ row }: { row: CrateRow }) {
  return (
    <p className="text-xs text-muted-foreground">
      {part("Crate", row.cratePrice)} + {part("Bundle", row.bundleCost)} − Refund {formatPrice(row.refund)}
    </p>
  );
}
