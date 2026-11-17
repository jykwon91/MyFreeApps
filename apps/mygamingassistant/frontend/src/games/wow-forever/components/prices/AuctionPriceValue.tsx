import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

/** One auction price on a "buy or make" row, or "no auction price". */
export default function AuctionPriceValue({ copper }: { copper: number | undefined }) {
  if (copper === undefined) return <NoAuctionPrice />;
  return <span className="font-medium tabular-nums">{formatCost(copper)}</span>;
}
