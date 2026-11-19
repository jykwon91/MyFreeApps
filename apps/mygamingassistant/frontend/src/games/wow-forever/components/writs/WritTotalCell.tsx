import { Skeleton } from "@platform/ui";
import WritDealPill from "@/games/wow-forever/components/writs/WritDealPill";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";

interface WritTotalCellProps {
  row: WritRow;
  loading: boolean;
}

/** Writ + item, the figure the grid is ordered by, with the Deal pill when it is under the tier's threshold. */
export default function WritTotalCell({ row, loading }: WritTotalCellProps) {
  if (loading) return <Skeleton className="h-6 w-20" />;
  if (row.total === null) return <span className="text-sm italic text-muted-foreground">No total</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xl font-bold tabular-nums text-primary lg:text-base" data-testid="writ-total">
        {formatCost(row.total)}
      </span>
      {row.deal ? <WritDealPill tier={row.writ.tier} /> : null}
    </div>
  );
}
