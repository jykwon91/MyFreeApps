import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

/** "(~1s 20c)" after a shopping line, or "(no auction price)". */
export default function CraftLineCost({ cost }: { cost: number | undefined }) {
  if (cost === undefined) {
    return (
      <span className="ml-2 text-xs">
        (<NoAuctionPrice />)
      </span>
    );
  }
  return <span className="ml-2 text-muted-foreground tabular-nums">({formatCost(cost)})</span>;
}
