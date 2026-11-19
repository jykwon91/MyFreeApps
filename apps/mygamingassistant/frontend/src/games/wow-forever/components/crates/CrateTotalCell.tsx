import { Skeleton } from "@platform/ui";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

interface CrateTotalCellProps {
  row: CrateRow;
  loading: boolean;
}

/** Crate + its cheapest bundle, the figure the grid is ordered by. */
export default function CrateTotalCell({ row, loading }: CrateTotalCellProps) {
  if (loading) return <Skeleton className="h-6 w-20" />;
  if (row.total === null) return <span className="text-sm italic text-muted-foreground">No total</span>;
  return (
    <span className="text-xl font-bold tabular-nums text-primary lg:text-base" data-testid="crate-total">
      {formatCost(row.total)}
    </span>
  );
}
