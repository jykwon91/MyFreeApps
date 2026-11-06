import type { AuctionSort } from "@/games/wow-forever/types/auctionSort";

export const DEFAULT_AUCTION_SORT: AuctionSort = "traded";

export const AUCTION_SORT_OPTIONS: readonly { id: AuctionSort; label: string }[] = [
  { id: "traded", label: "Most traded" },
  { id: "high", label: "Price high to low" },
  { id: "low", label: "Price low to high" },
  { id: "name", label: "Name" },
];

export function parseAuctionSort(raw: unknown): AuctionSort | null {
  return AUCTION_SORT_OPTIONS.find((o) => o.id === raw)?.id ?? null;
}
