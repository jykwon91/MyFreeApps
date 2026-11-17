import { PRICE_ROW } from "@/games/wow-forever/components/food/detail/detailStyles";
import AuctionPriceValue from "@/games/wow-forever/components/prices/AuctionPriceValue";
import MaterialsCostValue from "@/games/wow-forever/components/prices/MaterialsCostValue";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { craftedVerdict, materialsLabel } from "@/games/wow-forever/lib/itemPages/craftedPriceText";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import { materialsCost } from "@/games/wow-forever/prices/materialsCost";
import type { CraftedReagent } from "@/games/wow-forever/types/itemPages/craftedReagent";

interface CraftedPricesProps {
  reagents: readonly CraftedReagent[];
  /** The item, to price it against its materials; null when it can't be on the auction house (bind on pickup). */
  itemId: number | null;
  /** How many one craft makes; null until the recipe book loads, so the verdict waits for it. */
  made: number | null;
  /** The pattern / plans / formula that teaches it, when an item does. */
  pattern: { id: number; name: string } | null;
}

/** Craft or buy, at auction prices: the materials, the item itself (unless it binds on pickup), which is cheaper, and the pattern. Nothing until prices load. */
export default function CraftedPrices({ reagents, itemId, made, pattern }: CraftedPricesProps) {
  const { prices } = useAuctionPrices();
  if (!prices) return null;
  const cost = materialsCost(reagents, prices);
  const buy = itemId === null ? undefined : auctionCopper(prices, itemId);
  const answer = reagents.length && itemId !== null && made !== null ? craftedVerdict(cost, buy, made) : null;
  return (
    <div className="space-y-1" data-testid="crafted-prices">
      {reagents.length ? (
        <p className={PRICE_ROW}>
          <span>{materialsLabel(made ?? 1)}</span>
          <MaterialsCostValue cost={cost} />
        </p>
      ) : null}
      {itemId !== null ? (
        <p className={PRICE_ROW}>
          <span>Buy one at the auction house</span>
          <AuctionPriceValue copper={buy} />
        </p>
      ) : null}
      {answer ? <p className="text-sm font-medium">{answer}</p> : null}
      {pattern ? (
        <p className={PRICE_ROW}>
          <span>{pattern.name} at the auction house</span>
          <AuctionPriceValue copper={auctionCopper(prices, pattern.id)} />
        </p>
      ) : null}
    </div>
  );
}
