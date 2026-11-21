import { AUCTION_ROW_GRID } from "@/games/wow-forever/components/auctionHouse/auctionGrid";
import AuctionColumnHeader from "@/games/wow-forever/components/auctionHouse/AuctionColumnHeader";
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

interface AuctionHeaderRowProps {
  colSort: AuctionColumnSort | null;
  colDir: SortDirection;
  onColSort: (sort: AuctionColumnSort, dir: SortDirection) => void;
}

/** Column titles on sm+; on a phone each card labels its own figures instead. */
export default function AuctionHeaderRow({ colSort, colDir, onColSort }: AuctionHeaderRowProps) {
  return (
    <div role="row" className={`${AUCTION_ROW_GRID} hidden border-b py-1 sm:grid`}>
      <AuctionColumnHeader id="item" label="Item" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="market" label="Market value" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="cheapest" label="Cheapest" colSort={colSort} colDir={colDir} onColSort={onColSort} />
      <AuctionColumnHeader id="onsale" label="On sale" colSort={colSort} colDir={colDir} onColSort={onColSort} />
    </div>
  );
}
