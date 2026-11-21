import { AUCTION_ROW_GRID, AUCTION_ROW_GRID_UPGRADE } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import AuctionColumnHeader from "@/games/wow-forever/components/auctionHouse/AuctionColumnHeader";
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

interface AuctionHeaderRowProps {
  colSort: AuctionColumnSort | null;
  colDir: SortDirection;
  onColSort: (sort: AuctionColumnSort, dir: SortDirection) => void;
  /** Show the Upgrade column (a character's gear is known). */
  showUpgrade: boolean;
}

/** Column titles on sm+; on a phone each card labels its own figures instead. */
export default function AuctionHeaderRow({ colSort, colDir, onColSort, showUpgrade }: AuctionHeaderRowProps) {
  const grid = showUpgrade ? AUCTION_ROW_GRID_UPGRADE : AUCTION_ROW_GRID;
  return (
    <div role="row" className={`${grid} hidden border-b py-1 sm:grid`}>
      <AuctionColumnHeader id="item" label="Item" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="market" label="Market value" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="cheapest" label="Cheapest" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="onsale" label="On sale" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      {showUpgrade && <AuctionColumnHeader id="upgrade" label="Upgrade" colSort={colSort} colDir={colDir} onColSort={onColSort} />}
    </div>
  );
}
