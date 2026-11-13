import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import { AUCTION_PAGE_SIZE } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";

interface AuctionShowMoreProps {
  /** Items not shown yet. */
  remaining: number;
  onShowMore: () => void;
}

/** "Show 50 more" under a list that was cut short. */
export default function AuctionShowMore({ remaining, onShowMore }: AuctionShowMoreProps) {
  const next = Math.min(remaining, AUCTION_PAGE_SIZE);
  return (
    <button
      type="button"
      onClick={onShowMore}
      className="min-h-[44px] w-full rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted/40 sm:w-auto"
      data-testid="auction-show-more"
    >
      Show {next} more
      <span className="text-muted-foreground"> ({formatWhole(remaining)} left)</span>
    </button>
  );
}
