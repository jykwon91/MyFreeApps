import { AUCTION_ROW_GRID, AUCTION_ROW_LOOK } from "@/games/wow-forever/components/auctionHouse/auctionGrid";

const SKELETON_ROWS = 8;

/** Same grid as the loaded rows (icon block included): a card on a phone, a table row on sm+. */
export default function AuctionResultsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading auction prices" data-testid="auction-skeleton">
      <div className="h-5 w-40 rounded bg-muted/40 animate-pulse" aria-hidden />
      <ul className="space-y-3 sm:space-y-0" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li key={i} className={`${AUCTION_ROW_GRID} ${AUCTION_ROW_LOOK}`}>
            <div className="col-span-2 flex min-h-[44px] items-center gap-3 sm:col-span-1">
              <div className="size-12 shrink-0 rounded bg-muted/40 animate-pulse sm:size-10" />
              <div className="h-5 w-2/3 rounded bg-muted/40 animate-pulse" />
            </div>
            <div className="h-6 w-20 self-center rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-20 self-center rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-28 self-center rounded bg-muted/40 animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}
