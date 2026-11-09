import AuctionFigure from "@/games/wow-forever/components/auctionHouse/AuctionFigure";
import { AUCTION_ROW_GRID, AUCTION_ROW_LOOK } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

export default function AuctionRow({ item }: { item: AuctionPrice }) {
  return (
    <li className={`${AUCTION_ROW_GRID} ${AUCTION_ROW_LOOK}`} data-testid="auction-row">
      <span className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] items-center font-medium break-words">
        {itemLabel(item.name, item.itemId)}
      </span>
      <AuctionFigure label="Market value" value={priceOrDash(item.marketValue)} testId="auction-market" />
      <AuctionFigure label="Cheapest" value={priceOrDash(item.minBuyout)} testId="auction-cheapest" />
      <AuctionFigure label="On sale" value={onSaleText(item.quantity, item.listings)} testId="auction-on-sale" />
    </li>
  );
}
