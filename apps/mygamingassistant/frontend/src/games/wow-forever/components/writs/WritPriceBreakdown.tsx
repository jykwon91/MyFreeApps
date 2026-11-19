import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";

function part(label: string, copper: number | null): string {
  return `${label} ${copper === null ? "no price" : formatCost(copper)}`;
}

/** A phone card's "Writ X + Item Y" line; the wide grid has a column for each. */
export default function WritPriceBreakdown({ row }: { row: WritRow }) {
  return (
    <p className="text-xs text-muted-foreground">
      {part("Writ", row.writPrice)} + {part("Item", row.itemPrice)}
    </p>
  );
}
