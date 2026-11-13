import { auctionResultsCountText } from "@/games/wow-forever/lib/auctionHouse/auctionResultsCountText";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";

interface AuctionResultsNoteProps {
  /** Items that match, before paging. */
  total: number;
  /** Items listed right now. */
  shown: number;
  /** True when a search or filter is narrowing the list. */
  narrowed: boolean;
  /** Set when the list is one profession's materials. */
  professionLabel: string | null;
  /** Profession materials with no auctions right now. */
  notOnSale: number;
}

/** "1,204 items match", plus how many of them are listed so far. */
export default function AuctionResultsNote({ total, shown, narrowed, professionLabel, notOnSale }: AuctionResultsNoteProps) {
  return (
    <p className="text-sm" aria-live="polite" data-testid="auction-results-note">
      {auctionResultsCountText(total, narrowed, professionLabel)}
      {shown < total && <span className="text-muted-foreground"> · showing the first {formatWhole(shown)}</span>}
      {notOnSale > 0 && <span className="text-muted-foreground"> · {notOnSale} more have no auctions right now</span>}
    </p>
  );
}
