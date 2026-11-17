import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { MaterialsCost } from "@/games/wow-forever/types/materialsCost";

/**
 * "~1s 20c", or that nothing in it has a price, then what's left out of the sum
 * on a line of its own. Sits in a `PRICE_ROW` grid: the value takes the right
 * column, the note spans both.
 */
export default function MaterialsCostValue({ cost }: { cost: MaterialsCost }) {
  if (cost.missing.length === cost.materials) return <NoAuctionPrice />;
  return (
    <>
      <span className="text-right font-medium tabular-nums">{formatCost(cost.total)}</span>
      {cost.missing.length ? (
        <span className="col-span-2 text-xs text-muted-foreground">plus {cost.missing.join(", ")} (no auction price)</span>
      ) : null}
    </>
  );
}
