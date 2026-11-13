import { bisBadgeText } from "@/games/wow-forever/data/auctionHouse/auctionBisCopy";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";

/** A small tag on a row that is one of the top picks for its slot, e.g. "#1 Head". */
export default function AuctionBisBadge({ pick }: { pick: BisPick }) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium" data-testid="auction-bis-badge">
      {bisBadgeText(pick)}
    </span>
  );
}
