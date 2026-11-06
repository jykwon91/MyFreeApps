import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { CookCost } from "@/games/wow-forever/food/foodPrices";

/** "~1s 20c", or that nothing in it has a price, or what's left out of the sum. */
export default function FoodCookValue({ cook, reagents }: { cook: CookCost; reagents: number }) {
  if (cook.missing.length === reagents) return <NoAuctionPrice />;
  return (
    <span className="text-right">
      <span className="font-medium tabular-nums">{formatCost(cook.total)}</span>
      {cook.missing.length ? (
        <span className="block text-xs text-muted-foreground">
          plus {cook.missing.map((r) => r.name).join(", ")} (no auction price)
        </span>
      ) : null}
    </span>
  );
}
