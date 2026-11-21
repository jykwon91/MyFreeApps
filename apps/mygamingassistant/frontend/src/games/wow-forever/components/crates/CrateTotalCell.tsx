import { Skeleton } from "@platform/ui";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { formatCrateCost } from "@/games/wow-forever/lib/crates/formatCrateCost";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

interface CrateTotalCellProps {
  row: CrateRow;
  loading: boolean;
}

/** Crate + its cheapest bundle, less what the crate pays back when handed in. */
export default function CrateTotalCell({ row, loading }: CrateTotalCellProps) {
  if (loading) return <Skeleton className="h-6 w-20" />;
  if (row.total === null) return <span className="text-sm italic text-muted-foreground">No total</span>;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 lg:flex-col lg:items-start">
      <span className="text-base font-semibold tabular-nums lg:font-bold" data-testid="crate-total">
        {formatCrateCost(row.total)}
      </span>
      <span className="text-xs text-muted-foreground" data-testid="crate-refund">
        after {formatPrice(row.refund)} refund
      </span>
    </div>
  );
}
