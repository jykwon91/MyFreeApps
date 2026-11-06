/** What an item without an auction price shows in place of a price. It is never 0, because 0 would mean free. */
export default function NoAuctionPrice({ className = "" }: { className?: string }) {
  return <span className={`text-muted-foreground italic ${className}`}>no auction price</span>;
}
