import { BROWSE_LIMIT, SEARCH_LIMIT } from "@/games/wow-forever/prices/auctionSearch";
import type { AuctionSearchResult } from "@/games/wow-forever/types/auctionSearchResult";

interface AuctionResultsNoteProps {
  result: AuctionSearchResult;
  searching: boolean;
}

function noteText({ result, searching }: AuctionResultsNoteProps): string {
  if (!result.capped) return `${result.total} ${result.total === 1 ? "item" : "items"}`;
  if (searching) return `Showing the first ${SEARCH_LIMIT} of ${result.total} matches — type more to narrow it down`;
  return `Showing ${BROWSE_LIMIT} of ${result.total} — search to find any item`;
}

/** How many items are listed, and whether the list was cut short. */
export default function AuctionResultsNote(props: AuctionResultsNoteProps) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="auction-results-note">
      {noteText(props)}
    </p>
  );
}
