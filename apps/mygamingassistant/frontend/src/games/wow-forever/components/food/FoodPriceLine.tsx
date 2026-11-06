import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { cookCost } from "@/games/wow-forever/food/foodPrices";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import { itemsWithNoPrice } from "@/games/wow-forever/prices/missingText";
import type { FoodRecord } from "@/games/wow-forever/types/food";

/** "Cook ~24c · Buy ~1s 10c" under a pick. The detail page breaks it down. */
export default function FoodPriceLine({ food }: { food: FoodRecord }) {
  const { prices } = useAuctionPrices();
  if (!prices) return null;
  const cook = cookCost(food, prices);
  const buy = auctionCopper(prices, food.id);
  const cookPriced = food.reagents.length > 0 && cook.missing.length < food.reagents.length;
  const left = cook.missing.length;
  const leftText = left ? ` + ${itemsWithNoPrice(left)}` : "";
  return (
    <p className="text-xs text-muted-foreground tabular-nums" data-testid="food-price-line">
      Cook {cookPriced ? `${formatCost(cook.total)}${leftText}` : <NoAuctionPrice />} · Buy{" "}
      {buy === undefined ? <NoAuctionPrice /> : formatCost(buy)}
    </p>
  );
}
