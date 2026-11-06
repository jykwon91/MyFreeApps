import NoAuctionPrice from "@/games/wow-forever/components/prices/NoAuctionPrice";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

/** " — about ~1g 70s at the auction house" after an hour of cloth or leather, or that it has no auction price. */
export default function GoldAuctionValue({ copper }: { copper: number | undefined }) {
  if (copper === undefined) {
    return (
      <>
        {" "}
        (<NoAuctionPrice />)
      </>
    );
  }
  return <span className="font-medium tabular-nums"> — {formatCost(copper)} at the auction house</span>;
}
