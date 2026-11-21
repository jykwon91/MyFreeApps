import AuctionBisBadge from "@/games/wow-forever/components/auctionHouse/AuctionBisBadge";
import AuctionFigure from "@/games/wow-forever/components/auctionHouse/AuctionFigure";
import AuctionItemName from "@/games/wow-forever/components/auctionHouse/AuctionItemName";
import AuctionUpgradeCell from "@/games/wow-forever/components/auctionHouse/AuctionUpgradeCell";
import { AUCTION_ROW_GRID, AUCTION_ROW_GRID_UPGRADE, AUCTION_ROW_LOOK } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_LABELS } from "@/games/wow-forever/data/itemQualityStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { itemLabel, onSaleText, priceOrDash } from "@/games/wow-forever/prices/auctionFormat";
import type { AuctionUpgrade } from "@/games/wow-forever/types/auctionHouse/auctionUpgrade";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";

/** One item: its icon (48px on a phone, 40px from sm), name over up to two lines (and its top-pick tag), and its prices. */
interface AuctionRowProps {
  item: AuctionPrice;
  /** Set when the top-picks filter is on and this item is one of them. */
  pick: BisPick | null;
  /** Set when a character is known; shows the upgrade verdict against their equipped gear. */
  upgrade: AuctionUpgrade | undefined;
  /** Whether to render the upgrade column (true when a character is known). */
  showUpgrade: boolean;
}

export default function AuctionRow({ item, pick, upgrade, showUpgrade }: AuctionRowProps) {
  const icon = itemIcon(item.itemId);
  const grid = showUpgrade ? AUCTION_ROW_GRID_UPGRADE : AUCTION_ROW_GRID;
  return (
    <li className={`${grid} ${AUCTION_ROW_LOOK}`} data-testid="auction-row">
      <div className="col-span-2 flex min-h-[44px] min-w-0 items-center gap-3 sm:col-span-1">
        <GameIcon icon={icon} size={48} smSize={40} thickBorder alt="" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <AuctionItemName itemId={item.itemId} label={itemLabel(item.name, item.itemId)} />
          {pick && <AuctionBisBadge pick={pick} />}
        </div>
        {icon?.quality && <span className="sr-only">{QUALITY_LABELS[icon.quality]} quality</span>}
      </div>
      <AuctionFigure label="Market value" value={priceOrDash(item.marketValue)} testId="auction-market" />
      <AuctionFigure label="Cheapest" value={priceOrDash(item.minBuyout)} testId="auction-cheapest" />
      <AuctionFigure label="On sale" value={onSaleText(item.quantity, item.listings)} testId="auction-on-sale" />
      {showUpgrade && <AuctionUpgradeCell upgrade={upgrade} />}
    </li>
  );
}
