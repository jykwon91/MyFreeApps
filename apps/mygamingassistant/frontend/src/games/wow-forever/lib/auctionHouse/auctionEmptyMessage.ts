/** What the Auction house list says when nothing is left to show. Pure. */
import type { AuctionEmptyMessageInput } from "@/games/wow-forever/types/auctionHouse/auctionEmptyMessageInput";

/** Names the search and every filter that is on, so it's clear what to loosen. */
export function auctionEmptyMessage({ query, active, professionLabel }: AuctionEmptyMessageInput): string {
  const typed = query.trim();
  const filters = active.map((f) => f.label).join("; ");
  if (!typed && !filters) {
    return professionLabel ? `None of the ${professionLabel} materials are on sale on this auction house right now.` : "No items to show.";
  }
  const what = professionLabel ? `${professionLabel} materials on sale` : "items";
  const match = typed ? ` "${typed}"` : "";
  const withFilters = filters ? `${typed ? " with" : ""} these filters: ${filters}` : "";
  return `No ${what} match${match}${withFilters}.`;
}
