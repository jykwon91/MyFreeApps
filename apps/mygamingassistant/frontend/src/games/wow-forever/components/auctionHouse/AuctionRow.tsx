import AuctionFigure from "@/games/wow-forever/components/auctionHouse/AuctionFigure";
import { AUCTION_ROW_GRID, AUCTION_ROW_LOOK } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_LABELS } from "@/games/wow-forever/data/itemQualityStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** One item: its icon (48px on a phone, 40px from sm), name over up to two lines, and its prices. */
export default function AuctionRow({ item }: { item: AuctionPrice }) {
  const icon = itemIcon(item.itemId);
  return (
    <li className={`${AUCTION_ROW_GRID} ${AUCTION_ROW_LOOK}`} data-testid="auction-row">
      <div className="col-span-2 flex min-h-[44px] min-w-0 items-center gap-3 sm:col-span-1">
        <GameIcon icon={icon} size={48} smSize={40} thickBorder alt="" />
        <span className="line-clamp-2 min-w-0 break-words font-medium" data-testid="auction-item-name">
          {itemLabel(item.name, item.itemId)}
        </span>
        {icon?.quality && <span className="sr-only">{QUALITY_LABELS[icon.quality]} quality</span>}
      </div>
      <AuctionFigure label="Market value" value={priceOrDash(item.marketValue)} testId="auction-market" />
      <AuctionFigure label="Cheapest" value={priceOrDash(item.minBuyout)} testId="auction-cheapest" />
      <AuctionFigure label="On sale" value={onSaleText(item.quantity, item.listings)} testId="auction-on-sale" />
    </li>
  );
}
