import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { FILTER_SHEET_COPY } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";

/** "Apply · 12 items" with the live match count, or plain "Apply" while it's unknown. */
export function filterSheetApplyLabel(resultCount: number | null): string {
  if (resultCount === null) return FILTER_SHEET_COPY.apply;
  return `${FILTER_SHEET_COPY.apply} · ${formatCount(resultCount, "item", "items")}`;
}
