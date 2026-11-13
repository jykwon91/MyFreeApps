import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

export const DEFAULT_AUCTION_SORT: AuctionSort = "supply";

export const AUCTION_SORT_OPTIONS: readonly { id: AuctionSort; label: string }[] = [
  { id: "supply", label: "Most on sale" },
  { id: "listings", label: "Most listings" },
  { id: "high", label: "Price high to low" },
  { id: "low", label: "Price low to high" },
  { id: "gap", label: "Biggest gap" },
  { id: "quality", label: "Highest quality" },
  { id: "name", label: "Name" },
];

export function parseAuctionSort(raw: unknown): AuctionSort | null {
  return AUCTION_SORT_OPTIONS.find((o) => o.id === raw)?.id ?? null;
}
