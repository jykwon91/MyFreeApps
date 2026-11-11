import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { DETAIL_CHIP, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { placeLabel, stockLabel } from "@/games/wow-forever/food/recipeSources";
import { nearestBuys } from "@/games/wow-forever/lib/recipeVendors/nearestBuys";
import { distanceText, priceText } from "@/games/wow-forever/lib/recipeVendors/vendorText";
import type { RecipeBuy } from "@/games/wow-forever/types/recipeVendors/recipeBuy";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

interface RecipeBuyLinesProps {
  buys: readonly RecipeBuy[];
  place: VendorPlace;
}

/** On a route row: "Buy Recipe: Roast Raptor from <nearest vendor>" with price, stock, distance and Directions — one line per recipe. */
export default function RecipeBuyLines({ buys, place }: RecipeBuyLinesProps) {
  const lines = nearestBuys(buys, place);
  if (lines.length === 0) return null;
  const markNearest = lines.length > 1 && place.here !== null;
  return (
    <ul className="space-y-1" aria-label="Where to buy the recipe">
      {lines.map((line, i) => {
        if (line.kind === "otherFaction") {
          return (
            <li key={line.buy.itemId} className="text-sm text-muted-foreground">
              Only {FACTION_NAME[line.faction]} vendors sell <ItemIcon itemId={line.buy.itemId} />
              {line.buy.name}.
            </li>
          );
        }
        const { vendor, yards } = line.near;
        const price = priceText(line.buy.sources.price);
        const distance = distanceText(yards);
        return (
          <li key={line.buy.itemId} className="flex flex-wrap items-center justify-between gap-x-3 text-sm" data-testid="recipe-buy-line">
            <p className="min-w-0">
              {markNearest && i === 0 ? <span className={`${DETAIL_CHIP} mr-1`}>Nearest</span> : null}
              Buy <ItemIcon itemId={line.buy.itemId} />
              <span className="font-medium">{line.buy.name}</span> from <span className="font-medium">{vendor.name}</span>
              <span className="text-muted-foreground">
                {" "}
                — {placeLabel(vendor)} · {vendor.x.toFixed(1)}, {vendor.y.toFixed(1)}
                {price ? ` · ${price}` : null}
                {distance ? ` · ${distance}` : null}
              </span>
              {vendor.limited ? <span className={`${DETAIL_CHIP} ml-1`}>Limited: {stockLabel(vendor)}</span> : null}
            </p>
            <FoodDirectionsLink spot={vendor} name={vendor.name} />
          </li>
        );
      })}
    </ul>
  );
}
