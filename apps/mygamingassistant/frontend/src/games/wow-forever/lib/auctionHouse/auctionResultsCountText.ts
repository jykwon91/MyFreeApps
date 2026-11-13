import { formatCount } from "@/games/wow-forever/lib/character/formatCount";

/** "1,204 items match" / "12 Enchanting materials on sale": the count line above the list. Pure. */
export function auctionResultsCountText(total: number, narrowed: boolean, professionLabel: string | null): string {
  if (professionLabel) return `${formatCount(total, `${professionLabel} material`, `${professionLabel} materials`)} ${narrowed ? "match" : "on sale"}`;
  return `${formatCount(total, "item", "items")}${narrowed ? " match" : ""}`;
}
