import AuctionHeaderRow from "@/games/wow-forever/components/auctionHouse/AuctionHeaderRow";
import AuctionResultsNote from "@/games/wow-forever/components/auctionHouse/AuctionResultsNote";
import AuctionRow from "@/games/wow-forever/components/auctionHouse/AuctionRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";

interface AuctionResultsProps {
  result: AuctionSearchResult;
  query: string;
}

export default function AuctionResults({ result, query }: AuctionResultsProps) {
  if (result.items.length === 0) return <EmptyStateNote message={`No items match "${query.trim()}".`} />;
  return (
    <section className="space-y-3">
      <AuctionResultsNote result={result} searching={query.trim() !== ""} />
      <AuctionHeaderRow />
      <ul className="space-y-3 sm:space-y-0" data-testid="auction-results">
        {result.items.map((item) => (
          <AuctionRow key={item.itemId} item={item} />
        ))}
      </ul>
    </section>
  );
}
