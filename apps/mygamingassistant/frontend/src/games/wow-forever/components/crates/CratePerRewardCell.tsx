import { Skeleton } from "@platform/ui";
import { formatCrateCost } from "@/games/wow-forever/lib/crates/formatCrateCost";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

interface CratePerRewardCellProps {
  row: CrateRow;
  loading: boolean;
}

/** What one reward costs (the total after the refund over the crate's rewards), the figure the grid is ordered by. A phone card adds the reward count. */
export default function CratePerRewardCell({ row, loading }: CratePerRewardCellProps) {
  if (loading) return <Skeleton className="h-6 w-20" />;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      {row.costPerReward === null ? (
        <span className="text-sm italic text-muted-foreground">No per-reward price</span>
      ) : (
        <span className="text-xl font-bold tabular-nums text-primary lg:text-base" data-testid="crate-per-reward">
          {formatCrateCost(row.costPerReward)}
          <span className="text-sm font-medium lg:hidden"> per reward</span>
        </span>
      )}
      <span className="text-xs text-muted-foreground lg:hidden" data-testid="crate-reward-phone">
        {row.reward} rewards
      </span>
    </div>
  );
}
