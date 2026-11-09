import { AUCTION_ROW_GRID } from "@/games/wow-forever/components/auctionHouse/auctionGrid";

/** Column titles. On a phone each card labels its own figures instead. */
export default function AuctionHeaderRow() {
  return (
    <div className={`${AUCTION_ROW_GRID} hidden border-b py-2 text-xs font-medium text-muted-foreground sm:grid`} aria-hidden>
      <span>Item</span>
      <span>Market value</span>
      <span>Cheapest</span>
      <span>On sale</span>
    </div>
  );
}
