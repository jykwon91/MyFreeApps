import { OutboundLink } from "@platform/ui/discord-activity";
import AuctionFigure from "@/games/wow-forever/components/auctionHouse/AuctionFigure";
import { AUCTION_ROW_GRID, AUCTION_ROW_LOOK } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import { wowheadForeverItemUrl } from "@/games/wow-forever/lib/wowheadUrl";
import { itemLabel, priceOrDash, soldPerDayText } from "@/games/wow-forever/prices/auctionFormat";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

export default function AuctionRow({ item }: { item: AuctionPrice }) {
  return (
    <li className={`${AUCTION_ROW_GRID} ${AUCTION_ROW_LOOK}`} data-testid="auction-row">
      <OutboundLink
        href={wowheadForeverItemUrl(item.itemId)}
        className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline break-words"
      >
        {itemLabel(item.name, item.itemId)}
      </OutboundLink>
      <AuctionFigure label="Market value" value={priceOrDash(item.marketValue)} testId="auction-market" />
      <AuctionFigure label="Avg sale price" value={priceOrDash(item.avgSalePrice)} testId="auction-avg" />
      <AuctionFigure label="Sold per day" value={soldPerDayText(item.soldPerDay)} testId="auction-sold" />
    </li>
  );
}
