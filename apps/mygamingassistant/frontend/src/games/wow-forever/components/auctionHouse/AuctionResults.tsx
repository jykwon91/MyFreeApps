import type { ReactNode } from "react";
import AuctionHeaderRow from "@/games/wow-forever/components/auctionHouse/AuctionHeaderRow";
import AuctionRow from "@/games/wow-forever/components/auctionHouse/AuctionRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";

interface AuctionResultsProps {
  result: AuctionSearchResult;
  /** Shown instead of the list when nothing is in it. */
  emptyMessage: string;
  /** The count line above the list. */
  note: ReactNode;
}

export default function AuctionResults({ result, emptyMessage, note }: AuctionResultsProps) {
  if (result.items.length === 0) return <EmptyStateNote message={emptyMessage} />;
  return (
    <section className="space-y-3">
      {note}
      <AuctionHeaderRow />
      <ul className="space-y-3 sm:space-y-0" data-testid="auction-results">
        {result.items.map((item) => (
          <AuctionRow key={item.itemId} item={item} />
        ))}
      </ul>
    </section>
  );
}
