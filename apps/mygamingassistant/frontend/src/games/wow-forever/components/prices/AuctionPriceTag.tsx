import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";

interface AuctionPriceTagProps {
  itemId: number;
  /** How many you need. A count above 1 is priced as a total ("~48s for 4"). */
  count?: number;
}

/** "(~12s)" next to a material: its auction price. Nothing while prices load or if they failed, since the section's status line covers that. */
export default function AuctionPriceTag({ itemId, count = 1 }: AuctionPriceTagProps) {
  const { prices } = useAuctionPrices();
  if (!prices) return null;
  const each = auctionCopper(prices, itemId);
  if (each === undefined) {
    return (
      <span className="ml-2 text-xs">
        (<NoAuctionPrice />)
      </span>
    );
  }
  const text = count > 1 ? `${formatCost(each * count)} for ${count}` : `${formatCost(each)} each`;
  return (
    <span className="ml-2 text-xs text-muted-foreground tabular-nums" data-testid="auction-price">
      ({text})
    </span>
  );
}
