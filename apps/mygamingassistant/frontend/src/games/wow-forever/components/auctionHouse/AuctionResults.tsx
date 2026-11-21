import { useState, type ReactNode } from "react";
import AuctionHeaderRow from "@/games/wow-forever/components/auctionHouse/AuctionHeaderRow";
import AuctionMobileSort from "@/games/wow-forever/components/auctionHouse/AuctionMobileSort";
import AuctionRow from "@/games/wow-forever/components/auctionHouse/AuctionRow";
import AuctionShowMore from "@/games/wow-forever/components/auctionHouse/AuctionShowMore";
import { AUCTION_PAGE_SIZE } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { AuctionUpgrade } from "@/games/wow-forever/types/auctionHouse/auctionUpgrade";
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

interface AuctionResultsProps {
  /** Every match, in order; this shows the first page and a button for more. */
  items: readonly AuctionPrice[];
  /** What the list is showing (house, profession, filters). The paging starts over when it changes, not when prices refetch. */
  resultsKey: string;
  /** Tags a row that is a top pick; null when the top-picks filter is off. */
  bisPicks: ReadonlyMap<number, BisPick> | null;
  /** The count line above the list, given how many rows are listed. */
  note: (shown: number) => ReactNode;
  /** Active column-header sort; null = using the Sort-by dropdown order. */
  colSort: AuctionColumnSort | null;
  /** Direction for the active column sort. */
  colDir: SortDirection;
  /** Called when the user clicks a column header or the mobile sort control. */
  onColSort: (sort: AuctionColumnSort, dir: SortDirection) => void;
  /**
   * Per-row upgrade comparisons against the saved character's gear.
   * Null when no character is set or data is still loading.
   */
  upgradeMap: ReadonlyMap<number, AuctionUpgrade> | null;
}

/** The list, 50 at a time. A new search, filter, house or profession starts again from the first page. */
export default function AuctionResults({ items, resultsKey, bisPicks, note, colSort, colDir, onColSort, upgradeMap }: AuctionResultsProps) {
  const [paging, setPaging] = useState({ key: resultsKey, count: AUCTION_PAGE_SIZE });
  if (paging.key !== resultsKey) setPaging({ key: resultsKey, count: AUCTION_PAGE_SIZE });
  const shown = Math.min(paging.count, items.length);
  const showUpgrade = upgradeMap !== null;

  return (
    <section className="space-y-3">
      {note(shown)}
      <AuctionMobileSort colSort={colSort} colDir={colDir} onColSort={onColSort} showUpgrade={showUpgrade} />
      <AuctionHeaderRow colSort={colSort} colDir={colDir} onColSort={onColSort} showUpgrade={showUpgrade} />
      <ul className="space-y-3 sm:space-y-0" data-testid="auction-results">
        {items.slice(0, shown).map((item) => (
          <AuctionRow
            key={item.itemId}
            item={item}
            pick={bisPicks?.get(item.itemId) ?? null}
            upgrade={upgradeMap?.get(item.itemId)}
            showUpgrade={showUpgrade}
          />
        ))}
      </ul>
      {shown < items.length && (
        <AuctionShowMore remaining={items.length - shown} onShowMore={() => setPaging({ key: resultsKey, count: shown + AUCTION_PAGE_SIZE })} />
      )}
    </section>
  );
}
