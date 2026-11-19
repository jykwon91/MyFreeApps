import { Skeleton } from "@platform/ui";
import CrateBundleLabel from "@/games/wow-forever/components/crates/CrateBundleLabel";
import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";

interface CrateCheapestCellProps {
  cheapest: CrateBundleRow | null;
  loading: boolean;
}

/** The bundle that costs least to fill the crate with, or "no auction price" when none of its materials has one. */
export default function CrateCheapestCell({ cheapest, loading }: CrateCheapestCellProps) {
  if (loading) return <Skeleton className="h-4 w-32" />;
  return (
    <div className="min-w-0" data-testid="crate-cheapest">
      <span className="block text-xs text-muted-foreground lg:hidden">Cheapest bundle</span>
      {cheapest ? <CrateBundleLabel bundle={cheapest.bundle} /> : <NoAuctionPrice />}
    </div>
  );
}
