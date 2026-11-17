import { DETAIL_SECTION, PRICE_ROW } from "@/games/wow-forever/components/food/detail/detailStyles";
import AuctionPriceValue from "@/games/wow-forever/components/prices/AuctionPriceValue";
import MaterialsCostValue from "@/games/wow-forever/components/prices/MaterialsCostValue";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import { cheaperWay, makeOrBuyGap, materialsCost } from "@/games/wow-forever/prices/materialsCost";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { MaterialsCost } from "@/games/wow-forever/types/materialsCost";

/** "Cheaper to cook: saves ~40c on each one." */
function verdict(cook: MaterialsCost, buy: number | undefined): string | null {
  const way = cheaperWay(cook, buy);
  if (way === null || buy === undefined) return null;
  const saved = formatCost(makeOrBuyGap(cook, buy));
  return way === "make" ? `Cheaper to cook: saves ${saved} on each one.` : `Cheaper to buy: ${saved} less than the ingredients.`;
}

/**
 * Buy or cook: the food's own auction price beside its ingredients', and
 * the recipe's when a recipe item teaches it. Nothing to type, because the prices
 * come from the US auction house.
 */
export default function FoodPriceSection({ food }: { food: FoodRecord }) {
  const { prices } = useAuctionPrices();
  const cook = prices ? materialsCost(food.reagents, prices) : null;
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
            <p className={PRICE_ROW}>
              <span>Ingredients for one cook</span>
              <MaterialsCostValue cost={cook} />
            </p>
          ) : null}
          <p className={PRICE_ROW}>
            <span>Buy {food.name} at the auction house</span>
            <AuctionPriceValue copper={buy} />
          </p>
          {answer ? <p className="text-sm font-medium">{answer}</p> : null}
          {recipeItem !== null && food.learn.recipe ? (
            <p className={PRICE_ROW}>
              <span>The recipe ({food.learn.recipe})</span>
              <AuctionPriceValue copper={auctionCopper(prices, recipeItem)} />
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
