import FoodAuctionPrice from "@/games/wow-forever/components/food/detail/FoodAuctionPrice";
import FoodCookValue from "@/games/wow-forever/components/food/detail/FoodCookValue";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { cheaperWay, cookCost, type CookCost } from "@/games/wow-forever/food/foodPrices";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import type { FoodRecord } from "@/games/wow-forever/types/food";

const ROW = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm";

/** "Cheaper to cook: saves ~40c on each one." */
function verdict(cook: CookCost, buy: number | undefined): string | null {
  const way = cheaperWay(cook, buy);
  if (way === null || buy === undefined) return null;
  const saved = formatCost(Math.abs(buy - cook.total));
  return way === "cook" ? `Cheaper to cook: saves ${saved} on each one.` : `Cheaper to buy: ${saved} less than the ingredients.`;
}

/**
 * Buy or cook: the food's own auction price beside its ingredients', and
 * the recipe's when a recipe item teaches it. Nothing to type, because the prices
 * come from the US auction house.
 */
export default function FoodPriceSection({ food }: { food: FoodRecord }) {
  const { prices } = useAuctionPrices();
  const cook = prices ? cookCost(food, prices) : null;
  const buy = auctionCopper(prices, food.id);
  const recipeItem = food.learn.recipeItem;
  const answer = cook ? verdict(cook, buy) : null;
  return (
    <section aria-labelledby="food-prices" className={DETAIL_SECTION}>
      <h2 id="food-prices" className="text-base font-semibold">
        Buy or cook?
      </h2>
      <PriceStatus withoutPrices="showing the food without prices" />
      {prices && cook ? (
        <div className="space-y-2" data-testid="food-prices">
          {food.reagents.length ? (
            <p className={ROW}>
              <span>Ingredients for one cook</span>
              <FoodCookValue cook={cook} reagents={food.reagents.length} />
            </p>
          ) : null}
          <p className={ROW}>
            <span>Buy {food.name} at the auction house</span>
            <FoodAuctionPrice copper={buy} />
          </p>
          {answer ? <p className="text-sm font-medium">{answer}</p> : null}
          {recipeItem !== null && food.learn.recipe ? (
            <p className={ROW}>
              <span>The recipe ({food.learn.recipe})</span>
              <FoodAuctionPrice copper={auctionCopper(prices, recipeItem)} />
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
