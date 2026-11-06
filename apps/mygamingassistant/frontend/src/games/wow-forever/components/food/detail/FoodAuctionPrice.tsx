import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

/** One auction price on the "Buy or cook?" rows, or "no auction price". */
export default function FoodAuctionPrice({ copper }: { copper: number | undefined }) {
  if (copper === undefined) return <NoAuctionPrice />;
  return <span className="font-medium tabular-nums">{formatCost(copper)}</span>;
}
